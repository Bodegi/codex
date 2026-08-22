/**
 * Codex — Consume-into-group migration (pure).
 *
 * Moving a top-level field into a group only reshapes the *schema*; entry data stays at the old
 * top-level key and is orphaned (schemaDiff.js names those changes; the Save guard warns). This module
 * covers the one case where that move can be made **data-preserving**: when a field is consumed into a
 * **newly created** group. A new group is empty by definition, so there's exactly one correct result —
 * `entry.x` becomes the single record `entry.group = [{ x: entry.x }]`, the top-level `x` removed
 * (issue #55's unambiguous slice of #54's Option C).
 *
 * Everything ambiguous — a group that already has records, a group→top move, a field removal — stays
 * warn-and-orphan under #54's guard; this module deliberately handles only the empty-target case.
 *
 * Pure and Node-testable: no DOM, no SDK. `planConsume` reads two schemas; `consumeEntry`/
 * `consumeEntries` reshape entry data. The orchestrator (main.js) + firebase.js own the cloud writes.
 */

/**
 * A stored value carries real content worth wrapping into a record. Mirrors entryHasContent's notion
 * (null / blank string = empty) and extends it to the array/object values group-eligible kinds produce
 * (multi select/reference → arrays, banner → object). `0` and `false` are real values, not emptiness.
 */
export function hasData(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true; // number (incl. 0), boolean (incl. false)
}

/** The keys of a schema's top-level *non-group* fields (the fields a new group can consume). */
function topLevelFieldKeys(schema) {
  const keys = new Set();
  for (const f of schema?.fields || []) if (f?.key && f.kind !== 'group') keys.add(f.key);
  return keys;
}

/** The keys of a schema's group fields (used to tell a brand-new group from a pre-existing one). */
function groupFieldKeys(schema) {
  const keys = new Set();
  for (const f of schema?.fields || []) if (f?.key && f.kind === 'group') keys.add(f.key);
  return keys;
}

/**
 * The data-preserving consume migrations turning `prev` into `next`: for each group that is **new** in
 * `next` (its key absent from `prev`), the previously-top-level fields it now contains — those are the
 * fields whose entry data must be wrapped into the group. A move preserves a field's `key` (and a new
 * empty group can't force a key collision), so origin is matched by key.
 *
 * Returns `[{ groupKey, groupLabel, consumedKeys, consumed:[{ key, label }] }]`, one per new group that
 * absorbs at least one prior top-level field. A new group with only genuinely-new sub-fields (no
 * prev-top-level origin) contributes nothing — there's no data to migrate. `prev` is the last *saved*
 * schema, so its fields are committed; still-provisional new fields in `next` hold no data.
 */
export function planConsume(prev, next) {
  const prevTop = topLevelFieldKeys(prev);
  const prevGroups = groupFieldKeys(prev);
  const plans = [];
  for (const f of next?.fields || []) {
    if (f?.kind !== 'group' || !f.key || prevGroups.has(f.key)) continue; // only brand-new groups
    const consumed = [];
    for (const sub of f.fields || []) {
      if (sub?.key && prevTop.has(sub.key)) consumed.push({ key: sub.key, label: sub.label || sub.key });
    }
    if (consumed.length) {
      plans.push({
        groupKey: f.key,
        groupLabel: f.label || f.key,
        consumedKeys: consumed.map((c) => c.key),
        consumed,
      });
    }
  }
  return plans;
}

/**
 * Migrate one entry for a "new group `groupKey` consumes `consumedKeys`" change: wrap the entry's
 * top-level consumed values into a single group record and drop them from the top level. Returns
 * `{ changed, entry }` — a NEW entry object when changed, the untouched input otherwise.
 *
 * Idempotent + resumable: an entry with none of the consumed keys still at top level is already in the
 * new shape (or never held any), so it's returned unchanged — re-running the migration is safe, and a
 * batch that partly failed can be re-saved to finish. When no consumed key carries data, the group is
 * left empty (`[]`) rather than fabricating a blank record. The single record carries only the
 * data-bearing consumed values, in `consumedKeys` order.
 */
export function consumeEntry(entry, groupKey, consumedKeys) {
  if (!entry || typeof entry !== 'object') return { changed: false, entry };
  const has = (k) => Object.prototype.hasOwnProperty.call(entry, k);
  const present = consumedKeys.filter(has);
  if (present.length === 0) return { changed: false, entry }; // already migrated / nothing to consume
  const record = {};
  for (const k of consumedKeys) {
    if (has(k) && hasData(entry[k])) record[k] = entry[k];
  }
  const next = { ...entry };
  for (const k of present) delete next[k];
  next[groupKey] = Object.keys(record).length ? [record] : [];
  return { changed: true, entry: next };
}

/**
 * Apply `consumeEntry` across a list of entries, returning only the ones that changed — each the full
 * migrated doc (the entry write is a full replace, not a patch — see saveEntry's caller contract).
 * `entries` is left untouched.
 */
export function consumeEntries(entries, groupKey, consumedKeys) {
  const migrated = [];
  for (const e of entries || []) {
    const { changed, entry } = consumeEntry(e, groupKey, consumedKeys);
    if (changed) migrated.push(entry);
  }
  return migrated;
}
