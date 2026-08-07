import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeSvg } from './sanitizeSvg.js';

// ── passthrough / no-op on clean markup ──────────────────────────────────────

test('leaves clean icon markup untouched (bundled/designer output)', () => {
  const clean = '<svg viewBox="0 0 24 24" class="icon" fill="currentColor"><path d="M3 21V8l3-2z"/></svg>';
  assert.equal(sanitizeSvg(clean), clean);
});

test('is idempotent — sanitizing twice equals sanitizing once', () => {
  const dirty = '<svg onload="x()"><script>y()</script><circle/></svg>';
  const once = sanitizeSvg(dirty);
  assert.equal(sanitizeSvg(once), once);
});

test('non-string / empty input yields an empty string', () => {
  assert.equal(sanitizeSvg(null), '');
  assert.equal(sanitizeSvg(undefined), '');
  assert.equal(sanitizeSvg(''), '');
  assert.equal(sanitizeSvg(42), '');
});

// ── element stripping ────────────────────────────────────────────────────────

test('removes <script> elements and their contents', () => {
  const out = sanitizeSvg('<svg><script>alert(1)</script><circle r="5"/></svg>');
  assert.equal(out.includes('script'), false);
  assert.equal(out.includes('alert'), false);
  assert.equal(out.includes('<circle r="5"/>'), true);
});

test('removes <foreignObject> (it can host arbitrary HTML)', () => {
  const out = sanitizeSvg('<svg><foreignObject><body onload="alert(1)"></body></foreignObject><rect/></svg>');
  assert.equal(/foreignobject/i.test(out), false);
  assert.equal(out.includes('<rect/>'), true);
});

test('removes <style> blocks', () => {
  const out = sanitizeSvg('<svg><style>@import url(evil.css)</style><path/></svg>');
  assert.equal(/style/i.test(out), false);
  assert.equal(out.includes('<path/>'), true);
});

// ── event-handler attributes ─────────────────────────────────────────────────

test('strips on* handler attributes, quoted and bare', () => {
  const out = sanitizeSvg('<svg onload="a()"><circle onmouseover=\'b()\' onclick=c() r="5"/></svg>');
  assert.equal(/on(load|mouseover|click)/i.test(out), false);
  assert.equal(out.includes('r="5"'), true); // legitimate attributes survive
});

// ── dangerous URL schemes ────────────────────────────────────────────────────

test('drops javascript: in href / xlink:href', () => {
  const a = sanitizeSvg('<svg><a href="javascript:alert(1)"><rect/></a></svg>');
  assert.equal(a.includes('javascript'), false);
  assert.equal(a.includes('<a>'), true); // element kept, only the URL attr removed

  const b = sanitizeSvg('<svg><use xlink:href="javascript:alert(1)"/></svg>');
  assert.equal(b.includes('javascript'), false);
});

test('drops vbscript: and data: URLs', () => {
  assert.equal(sanitizeSvg('<svg><a href="vbscript:msgbox(1)"/></svg>').includes('vbscript'), false);
  assert.equal(sanitizeSvg('<svg><image src="data:text/html,<b>x</b>"/></svg>').includes('data:'), false);
});

test('catches numeric-entity obfuscated schemes', () => {
  const out = sanitizeSvg('<svg><a xlink:href="java&#115;cript:alert(1)"/></svg>');
  assert.equal(/href/i.test(out), false);
});

test('catches whitespace-split schemes (java\\tscript:)', () => {
  const out = sanitizeSvg('<svg><a href="java\tscript:alert(1)"/></svg>');
  assert.equal(/href/i.test(out), false);
});

test('keeps safe URLs — #fragment refs (gradients, <use>) survive', () => {
  const svg = '<svg><a href="#top"><use xlink:href="#core"/></a></svg>';
  assert.equal(sanitizeSvg(svg), svg);
});
