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

test('the idField never renders — identity, not content (no metadata box, no heading, no id echo)', () => {
  const html = renderEntryHTML('note', NOTE);
  assert.doesNotMatch(html, /metadata-box|Metadata/); // the whole callout is gone
  assert.doesNotMatch(html, /<h3>Note ID<\/h3>/);     // not resurrected as a section field
  assert.doesNotMatch(html, /welcome/);               // the readable id value appears nowhere
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

test('a set-but-unresolved hero shows the not-found placeholder (a delete never breaks a page)', () => {
  const ctx = { resolveImage: () => null };
  const html = renderEntryHTML('note', { ...NOTE, heroImage: 'gone.png' }, ctx);
  assert.match(html, /class="image-missing image-missing-hero"/);
});

test('an unset hero renders neither an image nor a placeholder', () => {
  const ctx = { resolveImage: () => null };
  const html = renderEntryHTML('note', { ...NOTE }, ctx);
  assert.doesNotMatch(html, /entry-hero|image-missing/);
});

test('gallery renders inline as a carousel in its section, with no field heading', () => {
  const ctx = { resolveImage: (id) => `/i/${id}` };
  const html = renderEntryHTML('note', { ...NOTE, gallery: ['a.png'] }, ctx);
  assert.match(html, /<h2>Imagery<\/h2>/);   // the section it lives in
  assert.match(html, /carousel/);
  assert.match(html, /src="\/i\/a.png"/);
  assert.doesNotMatch(html, /<h3>Gallery<\/h3>/); // break components carry no field heading
});

test('an Imagery section with an empty gallery (and no hero) collapses entirely', () => {
  const html = renderEntryHTML('note', { ...NOTE, gallery: [] });
  assert.doesNotMatch(html, /<h2>Imagery<\/h2>/);
});
