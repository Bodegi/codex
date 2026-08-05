import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bundledIcons,
  getIcon,
  findIcon,
  mergeIcons,
  setOverlayIcons,
  activeIcons,
  validateIcon,
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

// --- findIcon (strict, null-returning — the map glyph chain depends on the null) ---

test('findIcon returns the svg for a known key and null for unknown/empty', () => {
  assert.match(findIcon('civilization'), /<svg/);
  assert.equal(findIcon('not-a-real-icon'), null); // never the default glyph, unlike getIcon
  assert.equal(findIcon(''), null);
  assert.equal(findIcon(null), null);
});

test('findIcon looks up against a supplied registry', () => {
  const registry = [{ key: 'star', svg: '<svg id="star"></svg>' }];
  assert.match(findIcon('star', registry), /id="star"/);
  assert.equal(findIcon('civilization', registry), null);
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

// --- overlay (setOverlayIcons / activeIcons / getIcon default) ---

test('setOverlayIcons installs an overlay getIcon renders against by default', (t) => {
  t.after(() => setOverlayIcons([])); // restore bundled-only for other tests
  setOverlayIcons([{ key: 'star', svg: '<svg id="star"></svg>' }]);
  assert.match(getIcon('star'), /id="star"/); // overlay key resolves with no registry arg
  assert.match(getIcon('civilization'), /<svg/); // bundled baseline still present
});

test('setOverlayIcons lets an overlay override a bundled key', (t) => {
  t.after(() => setOverlayIcons([]));
  setOverlayIcons([{ key: 'civilization', svg: '<svg id="custom-civ"></svg>' }]);
  assert.match(getIcon('civilization'), /id="custom-civ"/);
});

test('setOverlayIcons([]) restores the bundled-only registry', () => {
  setOverlayIcons([{ key: 'star', svg: '<svg id="star"></svg>' }]);
  setOverlayIcons([]);
  assert.equal(getIcon('star'), DEFAULT_ICON); // overlay gone
  assert.deepEqual(activeIcons(), bundledIcons);
});

// --- validateIcon ---

test('validateIcon accepts a well-formed key + svg', () => {
  assert.deepEqual(validateIcon({ key: 'dragon-lair', svg: '<svg viewBox="0 0 24 24"></svg>' }), []);
});

test('validateIcon requires a key and rejects a malformed one', () => {
  assert.ok(validateIcon({ key: '', svg: '<svg></svg>' }).some((m) => /Key is required/.test(m)));
  assert.ok(validateIcon({ key: 'Bad Key', svg: '<svg></svg>' }).some((m) => /lowercase/.test(m)));
  assert.ok(validateIcon({ key: 'trailing-', svg: '<svg></svg>' }).some((m) => /lowercase/.test(m)));
});

test('validateIcon requires svg markup', () => {
  assert.ok(validateIcon({ key: 'ok', svg: '' }).some((m) => /SVG markup is required/.test(m)));
  assert.ok(validateIcon({ key: 'ok', svg: 'not markup' }).some((m) => /<svg> element/.test(m)));
});

test('validateIcon rejects a key longer than the max length', () => {
  const longKey = 'a'.repeat(33);
  assert.ok(validateIcon({ key: longKey, svg: '<svg></svg>' }).some((m) => /32 characters or fewer/.test(m)));
  // exactly at the limit is fine
  assert.deepEqual(validateIcon({ key: 'a'.repeat(32), svg: '<svg></svg>' }), []);
});

test('validateIcon flags a duplicate key on create but not an edit-in-place', () => {
  assert.ok(validateIcon({ key: 'dot', svg: '<svg></svg>' }, ['dot']).some((m) => /already exists/.test(m)));
  // editing 'dot' itself: caller omits it from existingKeys → no duplicate complaint
  assert.deepEqual(validateIcon({ key: 'dot', svg: '<svg></svg>' }, ['star']), []);
});
