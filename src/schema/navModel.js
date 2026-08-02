/**
 * Codex — Sidebar nav model.
 *
 * Pure shaping of the codex → type → entry tree the sidebar renders. Keeps the DOM
 * renderer dumb: given the current codex's types (from `listTypes()`) and its entries
 * grouped by type, produce one node per type — always with an `entries` array (empty
 * when a type has none) so the view never has to guard against `undefined`.
 *
 * Deliberately does not know about icons' SVG, capabilities, or the codex switcher —
 * those are layered on by the renderer. Types with no entries still appear (an author
 * needs to see an empty type to add to it).
 */

/**
 * @param {Array<{type:string,label:string,icon?:string}>} types  ordered entry types
 * @param {Object<string, Array>} entriesByType  entries grouped by type (each entry
 *   pre-shaped by the caller, typically `{ id, title }`)
 * @returns {Array<{type,label,icon,entries:Array}>}
 */
export function buildNavModel(types, entriesByType = {}) {
  return (types || []).map((t) => ({
    type: t.type,
    label: t.label,
    icon: t.icon,
    entries: entriesByType[t.type] || [],
  }));
}
