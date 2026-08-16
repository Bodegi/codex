import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSummaryCard, renderTypeIndex, isBadgeField, isRowField } from './summaryCard.js';
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
  fields: [
    { key: 'id', label: 'ID', kind: 'text' },
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'philosophy', label: 'Philosophy', kind: 'prose' },
    { key: 'mods', label: 'Mods', kind: 'list' },
    { key: 'ally', label: 'Ally', kind: 'reference', targetType: 'civ' },
    { key: 'exports', label: 'Exports', kind: 'text' },
    { key: 'imports', label: 'Imports', kind: 'text' },
    { key: 'crest', label: 'Crest', kind: 'banner' },
    { key: 'portrait', label: 'Portrait', kind: 'hero' },
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
  crest: { base: 'red', layers: [{ pattern: 'border', color: 'white' }] },
  portrait: 'img-aurora',
};

const ctx = {
  resolveRef: (_type, id) => ({ label: id === 'boreal' ? 'Boreal' : id, exists: true }),
  resolveImage: (id) => (id === 'img-aurora' ? 'https://cdn/aurora.png' : null),
};

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

test('a multi-select badge renders one chip per chosen option (#39)', () => {
  const schema = {
    type: 't',
    titleField: 'name',
    summaryCard: { badges: ['cats'] },
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'cats', label: 'Categories', kind: 'select', multi: true, options: ['Power', 'Magic'] },
    ],
  };
  const html = renderSummaryCard(schema, { id: 'x', name: 'X', cats: ['Power', 'Magic'] }, {});
  const chips = [...html.matchAll(/<span class="summary-badge">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(chips, ['Power', 'Magic']);
});

test('slot eligibility: multi-select is a badge not a row; single-select the reverse; null-safe', () => {
  assert.equal(isBadgeField({ kind: 'select', multi: true }), true);
  assert.equal(isRowField({ kind: 'select', multi: true }), false);
  assert.equal(isBadgeField({ kind: 'select' }), false);
  assert.equal(isRowField({ kind: 'select' }), true);
  assert.equal(isBadgeField(undefined), false);
  assert.equal(isRowField(undefined), false);
});

test('a stale card.rows entry for a now-multi-select field is not drawn twice (#39 / 2x)', () => {
  const schema = {
    type: 't',
    titleField: 'name',
    // Categories is a badge, but a leftover rows entry from when it was a scalar select still points at it.
    summaryCard: { badges: ['cats'], rows: [{ label: 'Categories', key: 'cats' }] },
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'cats', label: 'Categories', kind: 'select', multi: true, options: ['Power'] },
    ],
  };
  const html = renderSummaryCard(schema, { id: 'x', name: 'X', cats: ['Power'] }, {});
  assert.match(html, /<span class="summary-badge">Power<\/span>/); // drawn as a badge
  assert.doesNotMatch(html, /summary-card-row/); // and NOT also as a labelled row
});

test('rows render as labelled value pairs, and empty ones collapse', () => {
  const html = renderSummaryCard(SCHEMA, ENTRY, ctx);
  assert.match(html, /summary-row-label">Exports<\/span><span class="summary-row-value">Glass</);
  // An entry missing a row's value drops just that row.
  const partial = renderSummaryCard(SCHEMA, { ...ENTRY, imports: '' }, ctx);
  assert.doesNotMatch(partial, /Imports/);
  assert.match(partial, /Exports/);
});

test('a banner emblem renders the heraldry svg in the card face', () => {
  const html = renderSummaryCard({ ...SCHEMA, summaryCard: { emblem: 'crest' } }, ENTRY, ctx);
  assert.match(html, /class="summary-card summary-card--emblem"/);
  assert.match(html, /<span class="summary-card-emblem"><svg[^>]*class="banner-svg summary-emblem-svg"/);
  // The text column is wrapped so the thumbnail and text sit side by side.
  assert.match(html, /<span class="summary-card-main"><span class="summary-card-title">Aurora</);
});

test('a hero emblem resolves to a thumbnail image via ctx.resolveImage', () => {
  const html = renderSummaryCard({ ...SCHEMA, summaryCard: { emblem: 'portrait' } }, ENTRY, ctx);
  assert.match(html, /<span class="summary-card-emblem"><img class="summary-emblem-img" src="https:\/\/cdn\/aurora\.png"/);
});

test('an empty emblem value collapses the slot — the card stays a flat text card', () => {
  // A layerless banner is empty heraldry; an unset hero has no image. Either way, no emblem slot
  // and no --emblem modifier — byte-identical to a card with no emblem configured.
  const emptyCrest = renderSummaryCard(
    { ...SCHEMA, summaryCard: { emblem: 'crest' } },
    { ...ENTRY, crest: { base: 'red', layers: [] } },
    ctx
  );
  assert.doesNotMatch(emptyCrest, /summary-card-emblem|summary-card--emblem/);
  const noHero = renderSummaryCard(
    { ...SCHEMA, summaryCard: { emblem: 'portrait' } },
    { ...ENTRY, portrait: '' },
    ctx
  );
  assert.doesNotMatch(noHero, /summary-card-emblem|summary-card--emblem/);
});

test('an emblem naming a since-removed field is ignored, not fatal', () => {
  const html = renderSummaryCard({ ...SCHEMA, summaryCard: { emblem: 'gone' } }, ENTRY, ctx);
  assert.match(html, /summary-card-title">Aurora</);
  assert.doesNotMatch(html, /summary-card-emblem|summary-card--emblem/);
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
