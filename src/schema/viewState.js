/**
 * Codex — View-state machine.
 *
 * The single source of truth for "what am I looking at." Replaces the old two tangled
 * axes in `main.js` (`currentTab` being either a type or the literal `'admin'`, times a
 * `read`/`edit` `mode`) with one discriminated union:
 *
 *   { kind: 'type', type: <typeKey>|null, mode: 'read'|'edit'|'admin'|'index' }  // content surface
 *   { kind: 'global-admin', panel: 'access'|'codices'|'images'|'icons' }         // the separate door
 *
 * `mode: 'admin'` on a type means "edit that type's schema" — the per-thing form state
 * (the UI labels it "Structure"). `mode: 'index'` is the across-entries summary-card grid
 * (a read-only view of the whole type). `type` is `null` only in the empty-content case.
 *
 * Transitions are pure (view -> view) and never mutate their input. `normalize` is the one
 * clamp that keeps a view valid & permitted (folding in the old `ensureTypeSelection` +
 * `applyMode` force-to-read). The DOM shell (`main.js`) owns rendering; this module is
 * caps-aware only through `normalize`.
 */

const MODES = new Set(['read', 'edit', 'admin', 'index']);
const PANELS = new Set(['access', 'codices', 'images', 'icons']);

const typeView = (type, mode = 'read') => ({ kind: 'type', type: type ?? null, mode });

/** Select a content type. Always lands in read mode, regardless of the prior view. */
export function selectType(_view, type) {
  return typeView(type, 'read');
}

/** Flip a type view to read mode. No-op on a global-admin view. */
export function toRead(view) {
  return view && view.kind === 'type' ? { ...view, mode: 'read' } : view;
}

/** Flip a type view to edit mode. No-op on a global-admin view. */
export function toEdit(view) {
  return view && view.kind === 'type' ? { ...view, mode: 'edit' } : view;
}

/** Flip a type view to schema-admin ("Structure") mode. No-op on a global-admin view. */
export function toSchemaAdmin(view) {
  return view && view.kind === 'type' ? { ...view, mode: 'admin' } : view;
}

/** Flip a type view to the across-entries index (summary-card grid). No-op on a global-admin view. */
export function toIndex(view) {
  return view && view.kind === 'type' ? { ...view, mode: 'index' } : view;
}

/** Enter the global-admin door on the given panel (default access). */
export function openGlobalAdmin(_view, panel = 'access') {
  return { kind: 'global-admin', panel: PANELS.has(panel) ? panel : 'access' };
}

/** Swap the panel within the global-admin surface. No-op elsewhere. */
export function selectAdminPanel(view, panel) {
  return view && view.kind === 'global-admin' && PANELS.has(panel) ? { ...view, panel } : view;
}

/** Leave the global-admin door, returning to a content read view on the fallback type. */
export function closeGlobalAdmin(_view, fallbackType) {
  return typeView(fallbackType, 'read');
}

/**
 * Clamp any view to a valid, permitted one. The single home for existence + caps guards.
 *
 * @param {object} view                  any (possibly stale/garbage) view
 * @param {{caps?:object, types?:Array}} ctx
 *   caps  — `{ canEdit, canAdmin }` (defaults false)
 *   types — the current codex's types, either `{type,...}` objects or plain key strings
 * @returns {object} a valid view
 */
export function normalize(view, { caps = {}, types = [] } = {}) {
  const keys = (types || []).map((t) => (typeof t === 'string' ? t : t && t.type)).filter(Boolean);
  const canEdit = !!caps.canEdit;
  const canAdmin = !!caps.canAdmin;

  // Global-admin: preserved for admins, else dropped into content.
  if (view && view.kind === 'global-admin') {
    if (canAdmin) return { kind: 'global-admin', panel: PANELS.has(view.panel) ? view.panel : 'access' };
    return typeView(keys[0] ?? null, 'read');
  }

  // Content surface (also the fallback for undefined/garbage views).
  let type = view && view.kind === 'type' ? view.type : null;
  let mode = view && MODES.has(view.mode) ? view.mode : 'read';

  if (!keys.includes(type)) {
    // Missing/absent type retargets to the first available; mode resets to read.
    return typeView(keys[0] ?? null, 'read');
  }

  if (mode === 'edit' && !canEdit) mode = 'read';
  if (mode === 'admin' && !canAdmin) mode = 'read';

  return typeView(type, mode);
}
