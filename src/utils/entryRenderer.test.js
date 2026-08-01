import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderEntryHTML } from './entryRenderer.js';

const CIV = {
  id: 'dwarves',
  name: 'Dwarves — Masters of Industry',
  philosophy: 'Everything beneath the mountains.',
  exports: ['Metals', 'Machinery'],
  infrastructure: 'Tunnels and mine rail',
};

test('unknown type renders nothing', () => {
  assert.equal(renderEntryHTML('nope', {}), '');
});

test('the title field becomes the <h1> and is not repeated as a section field', () => {
  const html = renderEntryHTML('civilization', CIV);
  assert.match(html, /<h1>Dwarves — Masters of Industry<\/h1>/);
  assert.doesNotMatch(html, /<h3>Title \/ Name<\/h3>/);
});

test('sections render as <h2> and their fields as <h3>', () => {
  const html = renderEntryHTML('civilization', CIV);
  assert.match(html, /<h2>Core Identity<\/h2>/);
  assert.match(html, /<h3>Philosophy<\/h3>/);
});

test('the id field is metadata-only, not a section heading', () => {
  const html = renderEntryHTML('civilization', CIV);
  assert.match(html, /metadata-box/);
  assert.match(html, /dwarves/);
  assert.doesNotMatch(html, /<h3>Civilization ID<\/h3>/);
});

test('list fields render as a <ul>', () => {
  const html = renderEntryHTML('civilization', CIV);
  assert.match(html, /<ul><li>Metals<\/li><li>Machinery<\/li><\/ul>/);
});

test('reference fields resolve to links via ctx.resolveRef', () => {
  const mod = { id: 'create', name: 'Create', civilization: 'dwarves' };
  const ctx = { resolveRef: (type, id) => ({ label: 'Dwarves', exists: id === 'dwarves' }) };
  const html = renderEntryHTML('mod', mod, ctx);
  assert.match(html, /<a [^>]*data-ref-type="civilization"[^>]*data-ref-id="dwarves"[^>]*>Dwarves<\/a>/);
});

test('the hero image renders at the top when ctx resolves it', () => {
  const ctx = { resolveImage: (id) => (id === 'hall.png' ? '/h/hall.png' : null) };
  const html = renderEntryHTML('civilization', { ...CIV, heroImage: 'hall.png' }, ctx);
  assert.match(html, /class="entry-hero" src="\/h\/hall.png"/);
});

test('gallery is not rendered inline (handled by the appended carousel)', () => {
  const html = renderEntryHTML('civilization', { ...CIV, gallery: ['a.png'] });
  assert.doesNotMatch(html, /<h3>Inspiration<\/h3>/);
});
