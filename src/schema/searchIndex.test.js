import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSearchDocs, searchEntries } from './searchIndex.js';

// A schema exercising each searchable kind plus a media kind (which must NOT contribute text).
const CIV = {
  type: 'civ',
  label: 'Civilization',
  idField: 'id',
  titleField: 'name',
  fields: [
    { key: 'id', label: 'ID', kind: 'text' },
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'philosophy', label: 'Philosophy', kind: 'prose' },
    { key: 'mods', label: 'Mods', kind: 'list' },
    { key: 'ally', label: 'Ally', kind: 'reference', targetType: 'civ' },
    { key: 'banner', label: 'Banner', kind: 'hero' },
  ],
};

const ENTRIES = {
  civ: [
    {
      id: 'aurora',
      type: 'civ',
      name: 'Aurora',
      philosophy: 'Light over all — a people of dawn and radiant hope.',
      mods: ['solar', 'flight'],
      ally: 'umbra',
      banner: 'img_123',
    },
    {
      id: 'umbra',
      type: 'civ',
      name: 'Umbra',
      philosophy: 'Shadow keeps its own counsel.',
      mods: ['stealth'],
      banner: 'img_456',
    },
    {
      id: 'ghost',
      type: 'civ',
      name: 'Ghost',
      philosophy: 'Gone.',
      status: 'archived',
    },
  ],
};

const getSchema = (type) => (type === 'civ' ? CIV : null);
const ctx = {
  resolveRef: (_type, id) => ({ label: id === 'umbra' ? 'Umbra' : id, exists: true }),
};

test('buildSearchDocs flattens active entries and skips archived', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  assert.equal(docs.length, 2); // ghost (archived) excluded
  const aurora = docs.find((d) => d.id === 'aurora');
  assert.equal(aurora.type, 'civ');
  assert.equal(aurora.title, 'Aurora');
  assert.match(aurora.text, /radiant hope/); // prose
  assert.match(aurora.text, /solar, flight/); // list joined via displayValue
  assert.match(aurora.text, /Umbra/); // reference resolved to its label
  // The title and id ride separately (heading + internal slug); they don't clutter the body text.
  assert.doesNotMatch(aurora.text, /aurora/i);
});

test('title stays searchable even though it is not in the body text', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  const hits = searchEntries(docs, 'aurora');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'aurora');
});

test('buildSearchDocs excludes media fields (image ids are not searchable)', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  const aurora = docs.find((d) => d.id === 'aurora');
  assert.doesNotMatch(aurora.text, /img_123/);
});

test('buildSearchDocs skips types with no schema', () => {
  const docs = buildSearchDocs({ ...ENTRIES, ghosttype: [{ id: 'x', type: 'ghosttype' }] }, getSchema, ctx);
  assert.equal(docs.length, 2);
});

test('searchEntries: empty / whitespace query returns nothing', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  assert.deepEqual(searchEntries(docs, ''), []);
  assert.deepEqual(searchEntries(docs, '   '), []);
});

test('searchEntries matches body text, case-insensitively', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  const hits = searchEntries(docs, 'RADIANT');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'aurora');
});

test('searchEntries AND-semantics: every token must appear', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  assert.equal(searchEntries(docs, 'light dawn').length, 1); // both in aurora
  assert.equal(searchEntries(docs, 'light shadow').length, 0); // split across two entries
});

test('searchEntries ranks a title match above a body-only match', () => {
  // "umbra" is Umbra's title and Aurora's ally (body). Umbra should rank first.
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  const hits = searchEntries(docs, 'umbra');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].id, 'umbra');
});

test('searchEntries snippet flags the matched run for the renderer', () => {
  const docs = buildSearchDocs(ENTRIES, getSchema, ctx);
  const [hit] = searchEntries(docs, 'radiant');
  const marked = hit.parts.filter((p) => p.hit);
  assert.ok(marked.length >= 1);
  assert.match(marked[0].text, /radiant/i);
  // Reassembled snippet text is a substring of the source, ellipses aside.
  assert.match(hit.parts.map((p) => p.text).join(''), /radiant hope/i);
});

test('searchEntries respects the limit', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    type: 'civ',
    id: `e${i}`,
    title: `Entry ${i}`,
    text: 'common keyword here',
  }));
  assert.equal(searchEntries(many, 'keyword', { limit: 5 }).length, 5);
});
