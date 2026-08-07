import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIconPanelModel,
  buildEmblemPanelModel,
  glyphDesignerParams,
  buildGlyphLibraryPool,
  glyphSaveTarget,
} from './glyphAdminModel.js';

const BUNDLED = [
  { key: 'dot', svg: '<svg>dot</svg>' },
  { key: 'star', svg: '<svg>star</svg>' },
];

// ── buildIconPanelModel ──────────────────────────────────────────────────────

test('overlay rows are sorted by key and default missing fields', () => {
  const { overlayRows } = buildIconPanelModel([{ key: 'zeta' }, { key: 'alpha', label: 'A', svg: '<svg/>' }], BUNDLED);
  assert.deepEqual(overlayRows.map((r) => r.key), ['alpha', 'zeta']);
  const zeta = overlayRows.find((r) => r.key === 'zeta');
  assert.deepEqual([zeta.label, zeta.svg, zeta.status, zeta.layers], ['', '', 'active', null]);
});

test('overlay row flags whether it shadows a bundled key', () => {
  const { overlayRows } = buildIconPanelModel([{ key: 'star' }, { key: 'custom' }], BUNDLED);
  assert.equal(overlayRows.find((r) => r.key === 'star').bundled, true);
  assert.equal(overlayRows.find((r) => r.key === 'custom').bundled, false);
});

test('an active overlay hides its bundled baseline row; an archived one does not', () => {
  const active = buildIconPanelModel([{ key: 'star', status: 'active' }], BUNDLED);
  assert.deepEqual(active.bundledRows.map((r) => r.key), ['dot']); // star is overridden

  const archived = buildIconPanelModel([{ key: 'star', status: 'archived' }], BUNDLED);
  assert.deepEqual(archived.bundledRows.map((r) => r.key), ['dot', 'star']); // baseline resurfaces
});

test('status defaults to active, so an overlay with no status hides its baseline', () => {
  const { bundledRows } = buildIconPanelModel([{ key: 'dot' }], BUNDLED);
  assert.deepEqual(bundledRows.map((r) => r.key), ['star']);
});

// ── buildEmblemPanelModel ────────────────────────────────────────────────────

test('emblem rows sort by key and default missing fields', () => {
  const { rows } = buildEmblemPanelModel([{ key: 'gamma' }, { key: 'beta', label: 'B' }]);
  assert.deepEqual(rows.map((r) => r.key), ['beta', 'gamma']);
  assert.deepEqual([rows[1].label, rows[1].svg, rows[1].status, rows[1].layers], ['', '', 'active', null]);
});

// ── glyphDesignerParams ──────────────────────────────────────────────────────

test('creating: palette flows through, unlocked, empty initial, full key sets', () => {
  const p = glyphDesignerParams('mono', null, { iconKeys: ['a'], emblemKeys: ['b'] });
  assert.equal(p.palette, 'mono');
  assert.equal(p.lockPalette, false);
  assert.deepEqual(p.initial, {});
  assert.deepEqual(p.existingKeys, { mono: ['a'], color: ['b'] });
});

test('editing: palette locks, prefers the record palette, and excludes own key', () => {
  const rec = { key: 'flame', label: 'Flame', layers: [{ shape: 'circle' }], palette: 'color' };
  const p = glyphDesignerParams('mono', rec, { iconKeys: ['flame', 'x'], emblemKeys: ['flame', 'y'] });
  assert.equal(p.palette, 'color'); // record palette wins over the passed default
  assert.equal(p.lockPalette, true);
  assert.deepEqual(p.initial, { key: 'flame', label: 'Flame', layers: [{ shape: 'circle' }] });
  assert.deepEqual(p.existingKeys, { mono: ['x'], color: ['y'] }); // own key filtered from both
});

test('editing a record without an explicit palette falls back to the passed default', () => {
  const p = glyphDesignerParams('mono', { key: 'k', layers: [] }, {});
  assert.equal(p.palette, 'mono');
});

// ── buildGlyphLibraryPool ────────────────────────────────────────────────────

test('pool merges bundled with active overlay; overlay overrides same key', () => {
  const overlay = [{ key: 'star', svg: '<svg>custom-star</svg>', layers: [{ shape: 'rect' }] }];
  const pool = buildGlyphLibraryPool(BUNDLED, overlay);
  assert.deepEqual(pool.map((p) => p.key).sort(), ['dot', 'star']);
  const star = pool.find((p) => p.key === 'star');
  assert.equal(star.svg, '<svg>custom-star</svg>');
  assert.deepEqual(star.layers, [{ shape: 'rect' }]);
});

test('pool drops archived and markup-less overlay entries', () => {
  const overlay = [
    { key: 'archived', svg: '<svg/>', status: 'archived' },
    { key: 'nosvg', svg: '' },
    { key: 'good', svg: '<svg/>' },
  ];
  const pool = buildGlyphLibraryPool([], overlay);
  assert.deepEqual(pool.map((p) => p.key), ['good']);
});

// ── glyphSaveTarget ──────────────────────────────────────────────────────────

test('color palette routes to emblems; mono routes to icons', () => {
  const emblem = glyphSaveTarget({ key: 'flag', palette: 'color', label: 'F', svg: 's', layers: [] }, false);
  assert.equal(emblem.collection, 'emblem');
  const icon = glyphSaveTarget({ key: 'flag', palette: 'mono', label: 'F', svg: 's', layers: [] }, false);
  assert.equal(icon.collection, 'icon');
});

test('isEdit selects update vs create and shapes the toast', () => {
  const created = glyphSaveTarget({ key: 'flag', palette: 'mono' }, false);
  assert.equal(created.op, 'create');
  assert.equal(created.toast, 'Added icon “flag”');

  const updated = glyphSaveTarget({ key: 'flag', palette: 'color' }, true);
  assert.equal(updated.op, 'update');
  assert.equal(updated.toast, 'Saved emblem “flag”');
});

test('carries key and the doc data the write path persists', () => {
  const t = glyphSaveTarget({ key: 'flag', palette: 'mono', label: 'Flag', svg: '<svg/>', layers: [1] }, false);
  assert.equal(t.key, 'flag');
  assert.deepEqual(t.data, { label: 'Flag', svg: '<svg/>', layers: [1], palette: 'mono' });
});
