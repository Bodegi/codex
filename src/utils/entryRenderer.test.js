import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderEntryHTML } from './entryRenderer.js';
import { loadCodex } from '../schema/schemaStore.js';
import { demoSchemas } from '../data/demoFixture.js';

// The renderer resolves schemas through the store; load the demo codex's types for this file.
loadCodex('demo', demoSchemas);

const NOTE = {
  id: 'welcome',
  title: 'Welcome Note',
  body: 'Everything about the demo.',
  tags: ['Metals', 'Machinery'],
};

test('unknown type renders nothing', () => {
  assert.equal(renderEntryHTML('nope', {}), '');
});

test('the title field becomes the <h1> and is not repeated as a section field', () => {
  const html = renderEntryHTML('note', NOTE);
  assert.match(html, /<h1>Welcome Note<\/h1>/);
  assert.doesNotMatch(html, /<h3>Title<\/h3>/);
});

test('sections render as <h2> and their fields as <h3>', () => {
  const html = renderEntryHTML('note', NOTE);
  assert.match(html, /<h2>Note<\/h2>/);
  assert.match(html, /<h3>Body<\/h3>/);
});

test('the id field is metadata-only, not a section heading', () => {
  const html = renderEntryHTML('note', NOTE);
  assert.match(html, /metadata-box/);
  assert.match(html, /welcome/);
  assert.doesNotMatch(html, /<h3>Note ID<\/h3>/);
});

test('list fields render as a <ul>', () => {
  const html = renderEntryHTML('note', NOTE);
  assert.match(html, /<ul><li>Metals<\/li><li>Machinery<\/li><\/ul>/);
});

test('reference fields resolve to links via ctx.resolveRef', () => {
  const person = { id: 'ada', name: 'Ada', favoriteNote: 'welcome' };
  const ctx = { resolveRef: (type, id) => ({ label: 'Welcome', exists: id === 'welcome' }) };
  const html = renderEntryHTML('person', person, ctx);
  assert.match(html, /<a [^>]*data-ref-type="note"[^>]*data-ref-id="welcome"[^>]*>Welcome<\/a>/);
});

test('the hero image renders at the top when ctx resolves it', () => {
  const ctx = { resolveImage: (id) => (id === 'hall.png' ? '/h/hall.png' : null) };
  const html = renderEntryHTML('note', { ...NOTE, heroImage: 'hall.png' }, ctx);
  assert.match(html, /class="entry-hero" src="\/h\/hall.png"/);
});

test('gallery is not rendered inline (handled by the appended carousel)', () => {
  const html = renderEntryHTML('note', { ...NOTE, gallery: ['a.png'] });
  assert.doesNotMatch(html, /<h3>Gallery<\/h3>/);
});
