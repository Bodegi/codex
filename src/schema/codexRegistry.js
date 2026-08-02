/**
 * Codex — Registry list-shaping (pure).
 *
 * Given the raw `codices` meta docs and `permissions` docs, produce the lists the UI shows.
 * Mirrors the Firestore rules' access split: an admin sees every codex; a normal user sees
 * only the codices their permission docs grant. Archived codices never appear in the switcher
 * (they surface only in the admin Archived view via `archivedCodices`).
 */

const isActive = (c) => c && c.status !== 'archived';
const byName = (a, b) =>
  String(a.name || a.codexId).localeCompare(String(b.name || b.codexId), undefined, { sensitivity: 'base' });

/**
 * Active codices to show in the switcher, sorted by name.
 * @param {Array} codices      codex meta docs ({ codexId, name, status })
 * @param {Array} permissions  permission docs ({ uid, codexId, role })
 * @param {{isAdmin:boolean, uid:string}} viewer
 */
export function switcherCodices(codices = [], permissions = [], { isAdmin = false, uid = '' } = {}) {
  const active = codices.filter(isActive);
  if (isAdmin) return active.sort(byName);

  const granted = new Set(permissions.filter((p) => p && p.uid === uid).map((p) => p.codexId));
  return active.filter((c) => granted.has(c.codexId)).sort(byName);
}

/** Archived codices (admin Archived view), sorted by name. */
export function archivedCodices(codices = []) {
  return codices.filter((c) => c && c.status === 'archived').sort(byName);
}
