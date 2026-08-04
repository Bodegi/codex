import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyMapValue,
  normalizeMapValue,
  markerColor,
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

// --- render sides (string output; DOM/canvas wiring is browser-only) ---

test('renderMapInput falls back to a generic label and has no world-specific copy', () => {
  const html = renderMapInput({ key: 'map', kind: 'map' }, undefined, null);
  assert.match(html, /section-header">Map</); // label defaults to "Map"
  assert.match(html, /data-map-action="choose-image"/);
  assert.doesNotMatch(html, /Civilization/i);
  assert.doesNotMatch(html, /Atlas/i);
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
