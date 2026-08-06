import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectType,
  toRead,
  toEdit,
  toSchemaAdmin,
  toIndex,
  openGlobalAdmin,
  selectAdminPanel,
  closeGlobalAdmin,
  normalize,
} from './viewState.js';

const TYPES = [
  { type: 'civilization', label: 'Civilization' },
  { type: 'mod', label: 'Mod' },
];
const ADMIN = { canEdit: true, canAdmin: true };
const EDITOR = { canEdit: true, canAdmin: false };
const VIEWER = { canEdit: false, canAdmin: false };

const typeView = (type, mode) => ({ kind: 'type', type, mode });

// ---- transitions ---------------------------------------------------------

test('selectType lands in that type, read mode, regardless of prior view', () => {
  assert.deepEqual(selectType(typeView('mod', 'edit'), 'civilization'), typeView('civilization', 'read'));
  assert.deepEqual(selectType({ kind: 'global-admin', panel: 'codices' }, 'mod'), typeView('mod', 'read'));
});

test('toEdit / toRead / toSchemaAdmin / toIndex flip the mode of a type view', () => {
  const base = typeView('mod', 'read');
  assert.equal(toEdit(base).mode, 'edit');
  assert.equal(toSchemaAdmin(base).mode, 'admin');
  assert.equal(toIndex(base).mode, 'index');
  assert.equal(toRead(typeView('mod', 'index')).mode, 'read');
});

test('mode transitions do not mutate their input', () => {
  const base = typeView('mod', 'read');
  toEdit(base);
  assert.equal(base.mode, 'read');
});

test('mode transitions are no-ops on a global-admin view', () => {
  const ga = { kind: 'global-admin', panel: 'access' };
  assert.deepEqual(toEdit(ga), ga);
  assert.deepEqual(toSchemaAdmin(ga), ga);
  assert.deepEqual(toIndex(ga), ga);
});

test('openGlobalAdmin defaults to the access panel; honors an explicit panel', () => {
  assert.deepEqual(openGlobalAdmin(typeView('mod', 'read')), { kind: 'global-admin', panel: 'access' });
  assert.deepEqual(openGlobalAdmin(typeView('mod', 'read'), 'codices'), { kind: 'global-admin', panel: 'codices' });
});

test('selectAdminPanel swaps the panel within the global-admin surface', () => {
  assert.deepEqual(
    selectAdminPanel({ kind: 'global-admin', panel: 'access' }, 'codices'),
    { kind: 'global-admin', panel: 'codices' }
  );
  // The Images gallery is a valid third panel.
  assert.deepEqual(
    selectAdminPanel({ kind: 'global-admin', panel: 'access' }, 'images'),
    { kind: 'global-admin', panel: 'images' }
  );
  // Icons and Emblems are valid panels too.
  assert.deepEqual(
    selectAdminPanel({ kind: 'global-admin', panel: 'access' }, 'emblems'),
    { kind: 'global-admin', panel: 'emblems' }
  );
});

test('closeGlobalAdmin returns to a content read view on the fallback type', () => {
  assert.deepEqual(closeGlobalAdmin({ kind: 'global-admin', panel: 'access' }, 'mod'), typeView('mod', 'read'));
});

// ---- normalize -----------------------------------------------------------

test('normalize keeps a valid type view and its mode under full caps', () => {
  assert.deepEqual(normalize(typeView('mod', 'edit'), { caps: ADMIN, types: TYPES }), typeView('mod', 'edit'));
  assert.deepEqual(normalize(typeView('mod', 'admin'), { caps: ADMIN, types: TYPES }), typeView('mod', 'admin'));
});

test('normalize clamps edit/admin mode to read for a viewer', () => {
  assert.equal(normalize(typeView('mod', 'edit'), { caps: VIEWER, types: TYPES }).mode, 'read');
  assert.equal(normalize(typeView('mod', 'admin'), { caps: VIEWER, types: TYPES }).mode, 'read');
});

test('normalize preserves index mode for everyone — it needs no caps', () => {
  assert.equal(normalize(typeView('mod', 'index'), { caps: VIEWER, types: TYPES }).mode, 'index');
  assert.equal(normalize(typeView('mod', 'index'), { caps: ADMIN, types: TYPES }).mode, 'index');
});

test('normalize clamps schema-admin mode to read for a non-admin editor', () => {
  assert.equal(normalize(typeView('mod', 'admin'), { caps: EDITOR, types: TYPES }).mode, 'read');
  // editor keeps edit mode
  assert.equal(normalize(typeView('mod', 'edit'), { caps: EDITOR, types: TYPES }).mode, 'edit');
});

test('normalize retargets a missing type to the first available, resetting mode to read', () => {
  assert.deepEqual(normalize(typeView('ghost', 'edit'), { caps: ADMIN, types: TYPES }), typeView('civilization', 'read'));
});

test('normalize with no types yields the empty-content view', () => {
  assert.deepEqual(normalize(typeView('mod', 'edit'), { caps: ADMIN, types: [] }), typeView(null, 'read'));
});

test('normalize preserves a global-admin view (incl. panel) for an admin', () => {
  assert.deepEqual(
    normalize({ kind: 'global-admin', panel: 'codices' }, { caps: ADMIN, types: TYPES }),
    { kind: 'global-admin', panel: 'codices' }
  );
});

test('normalize drops a non-admin out of global-admin into content read', () => {
  assert.deepEqual(
    normalize({ kind: 'global-admin', panel: 'access' }, { caps: EDITOR, types: TYPES }),
    typeView('civilization', 'read')
  );
});

test('normalize is total: garbage/undefined view resolves to a valid content view', () => {
  assert.deepEqual(normalize(undefined, { caps: ADMIN, types: TYPES }), typeView('civilization', 'read'));
  assert.deepEqual(normalize({}, { caps: ADMIN, types: TYPES }), typeView('civilization', 'read'));
});

test('normalize accepts a plain array of type-key strings', () => {
  assert.deepEqual(normalize(typeView('mod', 'read'), { caps: ADMIN, types: ['civilization', 'mod'] }), typeView('mod', 'read'));
});
