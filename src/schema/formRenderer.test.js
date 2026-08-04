import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderForm } from './formRenderer.js';
import { getSchema, loadCodex } from './schemaStore.js';
import { demoSchemas } from '../data/demoFixture.js';

// The last test drives a real loaded schema through the store.
loadCodex('demo', demoSchemas);

const SCHEMA = {
  type: 'demo',
  sections: [
    {
      title: 'Basics',
      fields: [
        { key: 'name', label: 'Name', kind: 'text' },
        { key: 'notes', label: 'Notes', kind: 'prose' },
        { key: 'tags', label: 'Tags', kind: 'list' },
      ],
    },
    {
      title: 'Imagery',
      fields: [{ key: 'heroImage', label: 'Hero', kind: 'hero' }],
    },
  ],
};

test('renderForm renders a plain-text section header for a non-media section', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /class="section-header">Basics</);
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
  assert.match(html, /class="section-header">Imagery</);
  assert.match(html, /data-field-key="heroImage"/);
  assert.match(html, /data-media="hero-pick"/);
});

test('renderForm places a break component outside the .form-grid', () => {
  // The Imagery section is hero-only: its block sits directly in the section, not wrapped in a grid.
  const html = renderForm(SCHEMA, {});
  const imagery = html.slice(html.indexOf('>Imagery<'));
  assert.doesNotMatch(imagery.slice(0, imagery.indexOf('</div></div>')), /form-grid/);
});

test('renderForm gives prose/list the full-width grid cell', () => {
  const html = renderForm(SCHEMA, {});
  assert.match(html, /class="form-group form-grid-full"><label>Notes</);
  assert.match(html, /class="form-group form-grid-full"><label>Tags</);
  assert.match(html, /class="form-group"><label>Name</); // text stays a plain grid cell
});

test('renderForm shows a placeholder for an unknown field kind', () => {
  const schema = { type: 'x', sections: [{ title: 'S', fields: [{ key: 'k', label: 'K', kind: 'bogus' }] }] };
  assert.match(renderForm(schema, {}), /unknown field kind/);
});

test('renderForm drives a real loaded schema including its Imagery section', () => {
  const html = renderForm(getSchema('note'), { id: 'welcome', tags: ['demo'] });
  assert.match(html, /class="section-header">Note</);
  assert.match(html, /data-field-key="id"[^>]*value="welcome"/);
  assert.match(html, /data-field-key="tags"/);
  assert.match(html, /class="section-header">Imagery</);
  assert.match(html, /data-field-key="heroImage"/);
});
