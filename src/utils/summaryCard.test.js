import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSummaryCard, renderTypeIndex } from './summaryCard.js';
import { loadCodex } from '../schema/schemaStore.js';
import { demoSchemas } from '../data/demoFixture.js';

// renderTypeIndex resolves schemas through the store; renderSummaryCard takes a schema directly.
loadCodex('demo', demoSchemas);

// A self-contained schema exercising every card part, independent of the demo fixture.
const SCHEMA = {
  type: 'civ',
  label: 'Civilization',
  idField: 'id',
  titleField: 'name',
  summaryCard: {
    subtitle: 'philosophy',
    badges: ['mods', 'ally'],
    rows: [
      { label: 'Exports', key: 'exports' },
      { label: 'Imports', key: 'imports' },
    ],
  },
  sections: [
    {
      title: 'Core',
      fields: [
        { key: 'id', label: 'ID', kind: 'text' },
        { key: 'name', label: 'Name', kind: 'text' },
        { key: 'philosophy', label: 'Philosophy', kind: 'prose' },
        { key: 'mods', label: 'Mods', kind: 'list' },
        { key: 'ally', label: 'Ally', kind: 'reference', targetType: 'civ' },
        { key: 'exports', label: 'Exports', kind: 'text' },
        { key: 'imports', label: 'Imports', kind: 'text' },
      ],
    },
  ],
};

const ENTRY = {
  id: 'aurora',
  name: 'Aurora',
  philosophy: 'Light over all.',
  mods: ['solar', 'flight'],
  ally: 'boreal',
  exports: 'Glass',
  imports: 'Ore',
};

const ctx = { resolveRef: (_type, id) => ({ label: id === 'boreal' ? 'Boreal' : id, exists: true }) };

test('the title comes from the summaryCard.title, else titleField', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /class="summary-card-title">Aurora</);
  // A title override wins over titleField.
  const override = renderSummaryCard({ ...SCHEMA, summaryCard: { title: 'id' } }, ENTRY, ctx);
  assert.match(override, /class="summary-card-title">aurora</);
});

test('an untitled entry falls back to a placeholder — never the opaque id', () => {
  // The id is a click key, not a name: an entry with an id but no title reads "(untitled)".
  assert.match(renderSummaryCard(SCHEMA, { id: 'x' }, ctx), /summary-card-title">\(untitled\)</);
  assert.match(renderSummaryCard(SCHEMA, {}, ctx), /summary-card-title">\(untitled\)</);
});

test('the subtitle renders the named field as plain text', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /class="summary-card-subtitle">Light over all\.</);
});

test('list badges become one chip per item', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /<span class="summary-badge">solar<\/span>/);
  assert.match(html, /<span class="summary-badge">flight<\/span>/);
});

test('reference badges resolve to the target label via ctx.resolveRef', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /<span class="summary-badge">Boreal<\/span>/);
});

test('rows render as labelled value pairs, and empty ones collapse', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /summary-row-label">Exports<\/span><span class="summary-row-value">Glass</);
  // An entry missing a row's value drops just that row.
  const partial = renderSummaryCard(SCHEMA, { ...ENTRY, imports: '' }, ctx);
  assert.doesNotMatch(partial, /Imports/);
  assert.match(partial, /Exports/);
});

test('the card is a button carrying the entry id for click-through', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /<button type="button" class="summary-card" data-index-entry="aurora">/);
});

test('a type with no summaryCard still renders a title-only card', () => {
  const bare = { ...SCHEMA, summaryCard: undefined };
  const html = renderSummaryCard(bare, ENTRY, ctx);
  assert.match(html, /summary-card-title">Aurora</);
  assert.doesNotMatch(html, /summary-card-subtitle|summary-badge|summary-card-row/);
});

test('a summaryCard naming a since-removed field is ignored, not fatal', () => {
  const stale = {
    ...SCHEMA,
    summaryCard: { subtitle: 'gone', badges: ['ghost'], rows: [{ label: 'X', key: 'nope' }] },
  };
  const html = renderSummaryCard(stale, ENTRY, ctx);
  assert.match(html, /summary-card-title">Aurora</);
  assert.doesNotMatch(html, /summary-card-subtitle|summary-badge|summary-card-row/);
});

test('renderTypeIndex titles by the type label and renders one card per entry', () => {
  const html = renderTypeIndex('note', [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]);
  assert.match(html, /<h1>Note<\/h1>/);
  assert.match(html, /class="summary-index">/);
  assert.match(html, /data-index-entry="a"/);
  assert.match(html, /data-index-entry="b"/);
});

test('renderTypeIndex shows an empty state when the type has no entries', () => {
  const html = renderTypeIndex('note', []);
  assert.match(html, /<h1>Note<\/h1>/);
  assert.match(html, /summary-index-empty/);
});

test('renderTypeIndex on an unknown type renders nothing', () => {
  assert.equal(renderTypeIndex('nope', []), '');
});
