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

test('renderForm renders a heading component as an <h2> divider in the form', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /<h2 class="form-heading">Imagery<\/h2>/);
});

test('renderForm renders each field label and a control carrying its field-key', () => {
  const html = renderForm(SCHEMA, { name: 'Dwarves' });
  assert.match(html, />Name</);
  assert.match(html, /data-field-key="name"[^>]*value="Dwarves"/);
  assert.match(html, /data-field-key="notes"/);
  assert.match(html, /data-field-key="tags"/);
});

test('renderForm renders media fields inline as break blocks carrying their field-key', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /data-field-key="heroImage"/);
  assert.match(html, /data-media="hero-pick"/);
});

test('renderForm emits break components (heading, hero) outside the .form-grid', () => {
  // The grid of text/prose/list fields closes before the heading; the heading and the hero that
  // follow it stand on their own, not wrapped in a grid cell.
  const html = renderForm(SCHEMA, {});
  assert.match(html, /<\/div><h2 class="form-heading">Imagery<\/h2>/);
  const afterHeading = html.slice(html.indexOf('>Imagery<'));
  assert.doesNotMatch(afterHeading, /form-grid/);
});

test('renderForm gives prose/list the full-width grid cell', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /class="form-group form-grid-full"><label>Notes</);
  assert.match(html, /class="form-group form-grid-full"><label>Tags</);
  assert.match(html, /class="form-group"><label>Name</); // text stays a plain grid cell
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
