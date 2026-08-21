/**
 * Codex — Structural schema diff (pure).
 *
 * Entry data is keyed by a field's *position*: a top-level field's value lives at `data[key]`, a
 * group's sub-field at `data[groupKey][i][subKey]` (see groupModel.js). Nothing migrates stored data
 * when a field changes level, so moving a component into/out of a group — or deleting one — leaves the
 * old entry data **orphaned**: still on disk, but no longer read by the generated view, so content
 * looks wiped until the structure moves back. This module names those data-affecting changes so the
 * Save path can warn before committing one (and structure-history can label each version with what it
 * changed).
 *
 * `prev` is always the last *saved* schema, so its fields are committed — never provisional. New,
 * still-provisional fields in `next` hold no entry data, so pure additions produce no descriptor; only
 * a prev key that *vanished* or *relocated* orphans anything. Field identity across a move is its
 * `key` (moves preserve it, colliding keys are re-derived), and only these level transitions matter —
 * a label/placeholder/reorder edit is not structural and yields an empty list.
 */

function collect(schema) {
  const top = []; // { key, label, isGroup }
  const subs = []; // { key, label, groupKey, groupLabel }
  for (const f of schema?.fields || []) {
    if (!f?.key) continue;
    const isGroup = f.kind === 'group';
    top.push({ key: f.key, label: f.label || f.key, isGroup });
    if (isGroup) {
      for (const s of f.fields || []) {
        if (!s?.key) continue;
        subs.push({ key: s.key, label: s.label || s.key, groupKey: f.key, groupLabel: f.label || f.key });
      }
    }
  }
  return { top, subs };
}

/**
 * The data-orphaning changes turning `prev` into `next`, as descriptors:
 *   { kind, key, label, fromGroup?, toGroup? }
 * kind ∈ moved-into-group | moved-out-of-group | moved-between-groups | removed | group-removed.
 * Empty when nothing structural changed (renames, reorders, additions, edits to a field's config).
 */
export function summarizeSchemaChange(prev, next) {
  const p = collect(prev);
  const n = collect(next);
  const nextTopByKey = new Map(n.top.map((t) => [t.key, t]));
  const nextSubByKey = new Map(n.subs.map((s) => [s.key, s])); // sub keys collide across groups only pathologically; last wins
  const nextGroupKeys = new Set(n.top.filter((t) => t.isGroup).map((t) => t.key));
  const changes = [];
  const removedGroups = new Set();

  // Whole groups gone first, so their sub-fields aren't also reported one-by-one as removed.
  for (const t of p.top) {
    if (t.isGroup && !nextGroupKeys.has(t.key)) {
      changes.push({ kind: 'group-removed', key: t.key, label: t.label });
      removedGroups.add(t.key);
    }
  }

  // Prev top-level (non-group) fields: still top-level → fine; now a sub-field → moved in; gone → removed.
  for (const t of p.top) {
    if (t.isGroup) continue;
    if (nextTopByKey.has(t.key)) continue;
    const sub = nextSubByKey.get(t.key);
    if (sub) changes.push({ kind: 'moved-into-group', key: t.key, label: t.label, toGroup: sub.groupLabel });
    else changes.push({ kind: 'removed', key: t.key, label: t.label });
  }

  // Prev sub-fields (skipping any whose whole group was removed).
  for (const s of p.subs) {
    if (removedGroups.has(s.groupKey)) continue;
    const top = nextTopByKey.get(s.key);
    if (top && !top.isGroup) {
      changes.push({ kind: 'moved-out-of-group', key: s.key, label: s.label, fromGroup: s.groupLabel });
      continue;
    }
    const sub = nextSubByKey.get(s.key);
    if (sub) {
      if (sub.groupKey !== s.groupKey) {
        changes.push({ kind: 'moved-between-groups', key: s.key, label: s.label, fromGroup: s.groupLabel, toGroup: sub.groupLabel });
      }
      continue;
    }
    changes.push({ kind: 'removed', key: s.key, label: s.label, fromGroup: s.groupLabel });
  }

  return changes;
}

/** A change descriptor → a short human phrase (curly quotes, matching the app's toast voice). */
export function changePhrase(c) {
  const q = (s) => `“${s}”`;
  switch (c?.kind) {
    case 'moved-into-group': return `moved ${q(c.label)} into group ${q(c.toGroup)}`;
    case 'moved-out-of-group': return `moved ${q(c.label)} out of group ${q(c.fromGroup)}`;
    case 'moved-between-groups': return `moved ${q(c.label)} from group ${q(c.fromGroup)} to ${q(c.toGroup)}`;
    case 'group-removed': return `removed group ${q(c.label)}`;
    case 'removed': return c.fromGroup ? `removed ${q(c.label)} from group ${q(c.fromGroup)}` : `removed ${q(c.label)}`;
    default: return '';
  }
}
