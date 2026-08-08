/**
 * Codex — Full-text entry search (pure).
 *
 * The reader's "find an entry by a word in its body" path. Two pure steps, mirroring how
 * `summaryCard.js` shapes entries: first flatten each active entry into a searchable text
 * document, then rank those documents against a query. Both reuse `displayValue` from
 * `fieldKinds.js`, so text extraction stays in lock-step with how a field actually reads
 * (a reference resolves to its target's label, a list joins its items) and the module stays
 * DOM-free and Node-testable. `main.js` feeds it `state.entryIndex` + `getSchema` + the same
 * `renderCtx` the renderers use, and turns the returned snippet `parts` into `<mark>`s.
 *
 * Only these kinds carry words worth matching; media/map fields (image ids, coordinates) are
 * noise, so they're excluded rather than filtered after the fact.
 */

import { displayValue } from './fieldKinds.js';

const SEARCHABLE_KINDS = new Set(['text', 'prose', 'list', 'reference']);

/** How much text to show on each side of the first hit in a snippet. */
const SNIPPET_LEAD = 60;
const SNIPPET_TRAIL = 120;

function schemaFields(schema) {
  const out = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) out.push(field);
  }
  return out;
}

/**
 * Flatten a codex's active entries into search documents.
 *
 * @param {Object<string, Array>} byType  entries grouped by type (the live entry index)
 * @param {(type:string)=>object|null} getSchema  schema lookup for a type
 * @param {object} [ctx]  the edge adapter (resolveRef, …) — same one the renderers use
 * @returns {Array<{type,id,title,text}>}  one doc per active entry (archived + schemaless skipped)
 */
export function buildSearchDocs(byType, getSchema, ctx) {
  const docs = [];
  for (const type of Object.keys(byType || {})) {
    const schema = getSchema(type);
    if (!schema) continue;
    // The title rides in `doc.title` (its own heading + a searchable field in searchEntries), and the
    // id is an internal slug — excluding both keeps snippets to body context instead of echoing them.
    const fields = schemaFields(schema).filter(
      (f) => SEARCHABLE_KINDS.has(f.kind) && f.key !== schema.titleField && f.key !== schema.idField
    );
    for (const entry of byType[type] || []) {
      if (!entry || entry.status === 'archived') continue;
      const title = String(
        (schema.titleField && entry[schema.titleField]) || entry.name || entry.title || entry.id || '(untitled)'
      );
      const segments = [];
      for (const f of fields) {
        const shown = displayValue(f, entry[f.key], ctx);
        const text = shown == null ? '' : String(shown).trim();
        if (text) segments.push(text);
      }
      // `entry.id` (not schema.idField) is the open key — findEntry matches on it.
      docs.push({ type, id: entry.id, title, text: segments.join(' · ') });
    }
  }
  return docs;
}

/** Split a query into lowercased, de-duplicated word tokens. */
function tokenize(query) {
  const seen = new Set();
  for (const t of String(query ?? '').toLowerCase().split(/\s+/)) {
    if (t) seen.add(t);
  }
  return [...seen];
}

/** Index of the earliest occurrence of any token in `hay` (already lowercased), or -1. */
function firstHit(hay, tokens) {
  let best = -1;
  for (const t of tokens) {
    const i = hay.indexOf(t);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

/**
 * Split a slice of text into `{ text, hit }` segments, flagging every run that matches a token.
 * The renderer escapes each segment and wraps `hit` runs in `<mark>` — keeping HTML out of here.
 */
function markSegments(slice, tokens) {
  // A single regex of all tokens (longest-first so overlaps prefer the longer match), case-insensitive.
  const escaped = tokens
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(slice)) !== null) {
    if (m.index > last) parts.push({ text: slice.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loops
  }
  if (last < slice.length) parts.push({ text: slice.slice(last), hit: false });
  return parts;
}

/** Build the snippet parts for a doc: a window around the first body hit, with hits flagged. */
function snippet(text, tokens) {
  const hay = text.toLowerCase();
  const at = firstHit(hay, tokens);
  // No body hit (the match was title-only): show a plain lead-in, nothing to flag.
  if (at === -1) {
    const lead = text.slice(0, SNIPPET_LEAD + SNIPPET_TRAIL);
    const parts = lead ? [{ text: lead, hit: false }] : [];
    if (lead.length < text.length) parts.push({ text: '…', hit: false });
    return parts;
  }
  const start = Math.max(0, at - SNIPPET_LEAD);
  const end = Math.min(text.length, at + SNIPPET_TRAIL);
  const parts = markSegments(text.slice(start, end), tokens);
  if (start > 0) parts.unshift({ text: '…', hit: false });
  if (end < text.length) parts.push({ text: '…', hit: false });
  return parts;
}

/**
 * Rank search documents against a query. Every returned doc satisfies AND semantics (each query
 * token appears somewhere in its title or text). Ordered by title hits (a name match beats a
 * body-only match), then by how early the first body hit lands, then title A→Z for stability.
 *
 * @param {Array<{type,id,title,text}>} docs  from `buildSearchDocs`
 * @param {string} query
 * @param {{limit?:number}} [opts]
 * @returns {Array<{type,id,title,parts,score}>}  `parts` = snippet segments `[{text,hit}]`
 */
export function searchEntries(docs, query, { limit = 30 } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const results = [];
  for (const doc of docs || []) {
    const title = String(doc.title ?? '');
    const text = String(doc.text ?? '');
    const titleHay = title.toLowerCase();
    const bodyHay = text.toLowerCase();
    // AND: every token must appear in title or body.
    if (!tokens.every((t) => titleHay.includes(t) || bodyHay.includes(t))) continue;
    const titleHits = tokens.reduce((n, t) => n + (titleHay.includes(t) ? 1 : 0), 0);
    const firstBody = firstHit(bodyHay, tokens);
    results.push({
      type: doc.type,
      id: doc.id,
      title,
      parts: snippet(text, tokens),
      score: titleHits,
      _firstBody: firstBody === -1 ? Number.MAX_SAFE_INTEGER : firstBody,
    });
  }

  results.sort(
    (a, b) => b.score - a.score || a._firstBody - b._firstBody || a.title.localeCompare(b.title)
  );
  return results.slice(0, limit).map(({ _firstBody, ...r }) => r);
}
