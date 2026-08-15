import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderForm } from './formRenderer.js';
import { getSchema, loadCodex } from './schemaStore.js';
import { demoSchemas } from '../data/demoFixture.js';

// The last test drives a real loaded schema through the store.
loadCodex('demo', demoSchemas);

const SCHEMA = {
  type: 'demo',
  fields: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'notes', label: 'Notes', kind: 'prose' },
    { key: 'tags', label: 'Tags', kind: 'list' },
    { key: 'sec_imagery', label: 'Imagery', kind: 'heading' },
    { key: 'heroImage', label: 'Hero', kind: 'hero' },
  ],
};

test('renderForm renders a heading component as an <h2> divider (uncollapsible card)', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /field-card--heading[^>]*><h2 class="form-heading">Imagery<\/h2>/);
});

test('renderForm wraps each value field in a collapsible card: head label + hidden body control', () => {
  const html = renderForm(SCHEMA, { name: 'Dwarves' });
  // The head carries the label + a disclosure toggle; the control lives in a hidden body.
  assert.match(html, /class="field-card-label">Name</);
  assert.match(html, /data-field-toggle aria-expanded="false"/);
  assert.match(html, /<div class="field-card-body" id="fc-name" hidden><input[^>]*data-field-key="name"[^>]*value="Dwarves"/);
  assert.match(html, /id="fc-notes" hidden/);
  assert.match(html, /id="fc-tags" hidden/);
});

test('renderForm shows a read-only value summary in a collapsed card head', () => {
  const html = renderForm(SCHEMA, { name: 'Dwarves' });
  assert.match(html, /class="field-card-summary">Dwarves</);
  // An empty field summarises to a muted em dash.
  assert.match(html, /class="field-card-summary is-empty">—</);
});

test('renderForm renders media fields as cards carrying their field-key', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /data-field-key="heroImage"/);
  assert.match(html, /data-media="hero-pick"/);
  assert.match(html, /id="fc-heroImage" hidden/); // collapsed by default
});

test('renderForm opens the cards named in the expanded set', () => {
  const html = renderForm(SCHEMA, { name: 'Dwarves' }, undefined, new Set(['name']));
  // The open card's body is not hidden and its toggle reads expanded.
  assert.match(html, /<div class="field-card-body" id="fc-name"><input/);
  assert.match(html, /data-field-toggle aria-expanded="true"/);
  assert.match(html, /id="fc-notes" hidden/); // the rest stay collapsed
});

test('renderForm shows a placeholder for an unknown field kind', () => {
  const schema = { type: 'x', fields: [{ key: 'k', label: 'K', kind: 'bogus' }] };
  assert.match(renderForm(schema, {}), /unknown field kind/);
});

test('renderForm drives a real loaded schema including its heading + media', () => {
  const html = renderForm(getSchema('note'), { id: 'welcome', tags: ['demo'] });
  assert.match(html, /data-field-key="id"[^>]*value="welcome"/);
  assert.match(html, /data-field-key="tags"/);
  assert.match(html, /<h2 class="form-heading">Imagery<\/h2>/);
  assert.match(html, /data-field-key="heroImage"/);
});
