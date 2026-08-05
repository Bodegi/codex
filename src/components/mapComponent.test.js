import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyMapValue,
  normalizeMapValue,
  markerColor,
  markerLabel,
  resolveMarkerGlyph,
  simplifyPoints,
  renderMapInput,
  renderMapRead,
} from './mapComponent.js';

// --- pure helpers ---

test('emptyMapValue is the canonical empty shape', () => {
  assert.deepEqual(emptyMapValue(), { mapImageId: '', waypoints: [], roads: [], territories: [] });
});

test('normalizeMapValue fills every arm and coerces junk to empty', () => {
  assert.deepEqual(normalizeMapValue(undefined), emptyMapValue());
  assert.deepEqual(normalizeMapValue(null), emptyMapValue());
  assert.deepEqual(normalizeMapValue('nope'), emptyMapValue());
  assert.deepEqual(
    normalizeMapValue({ mapImageId: 42, waypoints: 'x', roads: [{ id: '1' }] }),
    { mapImageId: '', waypoints: [], roads: [{ id: '1' }], territories: [] }
  );
  const full = { mapImageId: 'm', waypoints: [{ id: 'a' }], roads: [], territories: [{ id: 't' }] };
  assert.deepEqual(normalizeMapValue(full), full);
});

test('markerColor: own color → field palette → neutral default', () => {
  assert.equal(markerColor({ color: '#123456' }, { palette: ['#abcdef'] }), '#123456');
  assert.equal(markerColor({}, { palette: ['#abcdef'] }), '#abcdef');
  assert.equal(markerColor(null, {}), '#f59e0b');
  assert.equal(markerColor(null, undefined), '#f59e0b');
});

test('markerLabel resolves under the field association mode (§4.1)', () => {
  const ctx = {
    resolveRef: (type, id) => (id === 'ada' ? { label: 'Ada', exists: true } : { label: id, exists: false }),
  };
  const both = { association: { mode: 'both', refType: 'person' } };
  const reference = { association: { mode: 'reference', refType: 'person' } };
  const labelOnly = { association: { mode: 'label' } };

  // both: an explicit label wins; a bare marker falls back to the referenced entry title.
  assert.equal(markerLabel({ label: 'Home', ref: 'ada' }, both, ctx), 'Home');
  assert.equal(markerLabel({ label: '', ref: 'ada' }, both, ctx), 'Ada');
  // reference: the entry title wins even over a stale free-text label.
  assert.equal(markerLabel({ label: 'stale', ref: 'ada' }, reference, ctx), 'Ada');
  // label mode ignores refs entirely.
  assert.equal(markerLabel({ label: 'Note', ref: 'ada' }, labelOnly, ctx), 'Note');
  // no ctx (the read paint before baking) → the stored label stands in.
  assert.equal(markerLabel({ label: 'x', ref: 'ada' }, both, undefined), 'x');
  // default mode is 'both' when the field declares no association.
  assert.equal(markerLabel({ label: '', ref: 'ada' }, {}, ctx), 'Ada');
});

// --- glyph resolution (fallback chain, §5.2) ---

test('resolveMarkerGlyph: explicit glyph wins', () => {
  const ctx = { resolveGlyph: (k) => (k === 'star' ? '<svg id="star"/>' : null) };
  assert.equal(resolveMarkerGlyph({ glyph: 'star' }, {}, ctx), '<svg id="star"/>');
});

test('resolveMarkerGlyph: inherits the referenced entry emblem when no explicit glyph', () => {
  const ctx = {
    resolveGlyph: (k) => (k === 'crown' ? '<svg id="crown"/>' : null),
    resolveRef: (_type, id) => (id === 'ada' ? { label: 'Ada', exists: true, emblem: 'crown' } : { label: id, exists: false }),
  };
  const field = { association: { mode: 'both', refType: 'person' } };
  assert.equal(resolveMarkerGlyph({ ref: 'ada' }, field, ctx), '<svg id="crown"/>');
});

test('resolveMarkerGlyph: an unresolved explicit key falls through to inheritance', () => {
  const ctx = {
    resolveGlyph: (k) => (k === 'crown' ? '<svg id="crown"/>' : null), // 'ghost' resolves to null
    resolveRef: () => ({ label: 'Ada', exists: true, emblem: 'crown' }),
  };
  const field = { association: { mode: 'both', refType: 'person' } };
  assert.equal(resolveMarkerGlyph({ glyph: 'ghost', ref: 'ada' }, field, ctx), '<svg id="crown"/>');
});

test('resolveMarkerGlyph: label-mode markers never inherit a ref emblem', () => {
  const ctx = {
    resolveGlyph: () => '<svg id="crown"/>',
    resolveRef: () => ({ label: 'x', exists: true, emblem: 'crown' }),
  };
  assert.equal(resolveMarkerGlyph({ ref: 'ada' }, { association: { mode: 'label' } }, ctx), null);
});

test('resolveMarkerGlyph: falls through to null (the palette-dot floor)', () => {
  const ctx = { resolveGlyph: () => null, resolveRef: () => ({ label: 'x', exists: true }) };
  assert.equal(resolveMarkerGlyph({ glyph: 'unknown', ref: 'ada' }, {}, ctx), null);
  assert.equal(resolveMarkerGlyph({}, {}, ctx), null);
  // No ctx / no resolveGlyph (the ctx-free read paint) → null, never a throw.
  assert.equal(resolveMarkerGlyph({ glyph: 'star' }, {}, undefined), null);
  assert.equal(resolveMarkerGlyph({ glyph: 'star' }, {}, {}), null);
});

// --- point simplification (Douglas–Peucker, §6.2) ---

test('simplifyPoints keeps endpoints and drops points within tolerance', () => {
  // A near-straight run of points collapses to its two endpoints.
  const line = [
    { x: 0, y: 0 },
    { x: 1, y: 0.1 },
    { x: 2, y: -0.1 },
    { x: 3, y: 0.05 },
    { x: 4, y: 0 },
  ];
  assert.deepEqual(simplifyPoints(line, 2), [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]);
});

test('simplifyPoints preserves a corner that exceeds the tolerance', () => {
  const bent = [
    { x: 0, y: 0 },
    { x: 5, y: 10 }, // a real corner, far from the 0→10 chord
    { x: 10, y: 0 },
  ];
  assert.deepEqual(simplifyPoints(bent, 2), bent);
});

test('simplifyPoints returns a copy and handles trivial inputs', () => {
  const pts = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  const out = simplifyPoints(pts, 2);
  assert.deepEqual(out, pts);
  assert.notEqual(out, pts); // fresh array, not the same reference
  assert.deepEqual(simplifyPoints([], 2), []);
  assert.deepEqual(simplifyPoints(undefined, 2), []);
  assert.deepEqual(simplifyPoints([{ x: 0, y: 0 }], 2), [{ x: 0, y: 0 }]);
});

// --- render sides (string output; DOM/canvas wiring is browser-only) ---

test('renderMapInput falls back to a generic label and has no world-specific copy', () => {
  const html = renderMapInput({ key: 'map', kind: 'map' }, undefined, null);
  assert.match(html, /section-header">Map</); // label defaults to "Map"
  assert.match(html, /data-map-action="choose-image"/);
  assert.match(html, /class="map-pin-layer"/); // Phase 2: DOM pin overlay
  assert.match(html, /data-map-action="toggle-draw-mode"/); // freehand ⇄ vertex toggle
  assert.doesNotMatch(html, /Civilization/i);
  assert.doesNotMatch(html, /Atlas/i);
});

test('renderMapRead includes the pin overlay layer for the paint pass', () => {
  const html = renderMapRead(
    { key: 'map', label: 'Map' },
    { mapImageId: 'm', waypoints: [{ id: '1', kind: 'waypoint', x: 1, y: 2, label: 'A' }], roads: [], territories: [] },
    { resolveImage: (id) => `/i/${id}` }
  );
  assert.match(html, /class="map-pin-layer"/);
});

test('renderMapRead embeds the normalized value + palette for the paint pass', () => {
  const html = renderMapRead(
    { key: 'map', label: 'Map', palette: ['#111111'] },
    { mapImageId: 'm', waypoints: [{ id: '1', kind: 'waypoint', x: 1, y: 2, label: 'A' }], roads: [], territories: [] },
    { resolveImage: (id) => `/i/${id}` }
  );
  assert.match(html, /data-map-palette=/);
  // The value round-trips through the data attribute (quotes escaped as &quot;).
  const m = /data-map-value="([^"]*)"/.exec(html);
  assert.ok(m, 'value attribute present');
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(JSON.parse(decoded).waypoints[0].label, 'A');
});

test('renderMapRead bakes the referenced entry title into the pin label (§7)', () => {
  const field = { key: 'map', label: 'Map', association: { mode: 'reference', refType: 'person' } };
  const value = {
    mapImageId: 'm',
    waypoints: [{ id: '1', kind: 'waypoint', x: 1, y: 2, label: '', ref: 'ada' }],
    roads: [],
    territories: [],
  };
  const ctx = { resolveImage: (id) => `/i/${id}`, resolveRef: () => ({ label: 'Ada', exists: true }) };
  const html = renderMapRead(field, value, ctx);
  const m = /data-map-value="([^"]*)"/.exec(html);
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(JSON.parse(decoded).waypoints[0].label, 'Ada');
});

test('renderMapInput exposes the name + association inspector slots', () => {
  const html = renderMapInput(
    { key: 'map', kind: 'map', association: { mode: 'both', refType: 'person' } },
    undefined,
    null
  );
  assert.match(html, /map-inspector-name-group/);
  assert.match(html, /map-inspector-assoc-group/);
  assert.match(html, /class="form-control map-inspector-assoc"/);
});

test('renderMapInput exposes the glyph picker slot (Phase 4)', () => {
  const html = renderMapInput({ key: 'map', kind: 'map' }, undefined, null);
  assert.match(html, /map-inspector-glyph-group/);
  assert.match(html, /class="form-control map-inspector-glyph"/);
  assert.match(html, /map-inspector-glyph-preview/);
});

test('renderMapRead bakes the resolved glyph SVG into the waypoint (§5.2)', () => {
  const field = { key: 'map', label: 'Map', association: { mode: 'both', refType: 'person' } };
  const value = {
    mapImageId: 'm',
    waypoints: [
      { id: '1', kind: 'waypoint', x: 1, y: 2, label: 'Keep', glyph: 'star' },
      { id: '2', kind: 'waypoint', x: 3, y: 4, label: 'Plain' },
    ],
    roads: [],
    territories: [],
  };
  const ctx = {
    resolveImage: (id) => `/i/${id}`,
    resolveGlyph: (k) => (k === 'star' ? '<svg id="star"></svg>' : null),
    resolveRef: () => ({ label: 'x', exists: true }),
  };
  const html = renderMapRead(field, value, ctx);
  const m = /data-map-value="([^"]*)"/.exec(html);
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const wps = JSON.parse(decoded).waypoints;
  assert.equal(wps[0].glyphSvg, '<svg id="star"></svg>'); // resolved glyph baked in
  assert.equal(wps[1].glyphSvg, ''); // no glyph → empty, falls back to the dot on paint
});
