import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bundledIcons,
  getIcon,
  mergeIcons,
  DEFAULT_ICON,
  DEFAULT_ICON_KEY,
} from './iconRegistry.js';

// --- bundled registry shape ---

test('bundledIcons is a non-empty array of { key, svg } entries', () => {
  assert.ok(Array.isArray(bundledIcons));
  assert.ok(bundledIcons.length > 0);
  bundledIcons.forEach((entry) => {
    assert.equal(typeof entry.key, 'string');
    assert.match(entry.svg, /<svg/);
  });
});

test('bundled keys are unique', () => {
  const keys = bundledIcons.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every seed type has a bundled icon so nav is never bare', () => {
  const keys = new Set(bundledIcons.map((e) => e.key));
  ['civilization', 'mod', 'region', 'decision'].forEach((k) => assert.ok(keys.has(k), `missing ${k}`));
});

// --- getIcon ---

test('getIcon returns the svg markup for a known key', () => {
  assert.match(getIcon('civilization'), /<svg/);
});

test('getIcon returns the default icon for an unknown key', () => {
  assert.equal(getIcon('not-a-real-icon'), DEFAULT_ICON);
});

test('getIcon returns the default icon for a null/empty key', () => {
  assert.equal(getIcon(null), DEFAULT_ICON);
  assert.equal(getIcon(''), DEFAULT_ICON);
});

test('getIcon looks up against a supplied registry, not just the bundled one', () => {
  const registry = [{ key: 'star', svg: '<svg id="star"></svg>' }];
  assert.match(getIcon('star', registry), /id="star"/);
  // a bundled-only key is absent from the supplied registry → default
  assert.equal(getIcon('civilization', registry), DEFAULT_ICON);
});

test('the default icon is valid svg and its key resolves to it', () => {
  assert.match(DEFAULT_ICON, /<svg/);
  assert.equal(getIcon(DEFAULT_ICON_KEY), DEFAULT_ICON);
});

// --- mergeIcons ---

test('mergeIcons appends extra-only keys after the bundled ones', () => {
  const bundled = [{ key: 'a', svg: '<svg>a</svg>' }];
  const extra = [{ key: 'b', svg: '<svg>b</svg>' }];
  const merged = mergeIcons(bundled, extra);
  assert.deepEqual(merged.map((e) => e.key), ['a', 'b']);
});

test('mergeIcons lets extra win on a duplicate key without removing the bundled slot', () => {
  const bundled = [{ key: 'a', svg: '<svg>bundled-a</svg>' }, { key: 'b', svg: '<svg>b</svg>' }];
  const extra = [{ key: 'a', svg: '<svg>extra-a</svg>' }];
  const merged = mergeIcons(bundled, extra);
  assert.deepEqual(merged.map((e) => e.key), ['a', 'b']); // no duplicate, order kept
  assert.equal(getIcon('a', merged), '<svg>extra-a</svg>'); // extra won
});

test('mergeIcons treats a missing/empty extra as just the bundled set', () => {
  const bundled = [{ key: 'a', svg: '<svg>a</svg>' }];
  assert.deepEqual(mergeIcons(bundled, []), bundled);
  assert.deepEqual(mergeIcons(bundled), bundled);
  assert.deepEqual(mergeIcons(bundled, null), bundled);
});
