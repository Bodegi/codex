import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyMapValue,
  normalizeMapValue,
  markerColor,
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
