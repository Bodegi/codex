/**
 * Codex — pure client-side row filter for the admin panels.
 *
 * The admin panels (Images, Users & Access, Invites) already hold their whole collection in memory,
 * so narrowing them is pure array work over data already loaded — this is the near-term half of #6
 * (pagination, which actually cuts Firestore reads, is the deferred edge refactor). Each panel hands
 * its rows through here with a `toText` extractor that flattens a row to its searchable words; that
 * keeps derived text (resolved codex names, invite redeemers) at the call site and this module
 * DOM-free and Node-testable. AND-tokenized substring match mirrors `searchIndex.js` so the two
 * search surfaces feel the same — minus the ranking/snippets a roster filter doesn't need.
 */

/** Split a query into lowercased, de-duplicated word tokens (mirrors searchIndex.tokenize). */
function tokenize(query) {
  const seen = new Set();
  for (const t of String(query ?? '').toLowerCase().split(/\s+/)) {
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * Narrow `rows` to those matching every query token (AND). An empty/whitespace query keeps them all.
 *
 * @template T
 * @param {T[]} rows
 * @param {string} query
 * @param {(row: T) => string} toText  flattens a row to its searchable text
 * @returns {T[]}  the same array reference when the query is empty, else a filtered copy
 */
export function filterRows(rows, query, toText) {
  const list = rows || [];
  const tokens = tokenize(query);
  if (!tokens.length) return list;
  return list.filter((row) => {
    const hay = String(toText(row) ?? '').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
