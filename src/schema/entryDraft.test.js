import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankEntry } from './entryDraft.js';

const schema = {
  type: 'person',
  idField: 'id',
  titleField: 'name',
  sections: [
    {
      title: 'Person',
      fields: [
        { key: 'id', kind: 'text' },
        { key: 'name', kind: 'text' },
        { key: 'bio', kind: 'prose' },
        { key: 'tags', kind: 'list' },
        { key: 'favoriteNote', kind: 'reference', targetType: 'note' },
        { key: 'factions', kind: 'reference', targetType: 'note', multi: true },
        { key: 'gallery', kind: 'gallery' },
        { key: 'heroImage', kind: 'hero' },
      ],
    },
  ],
};

test('blankEntry carries the type and starts active', () => {
  const e = blankEntry(schema);
  assert.equal(e.type, 'person');
  assert.equal(e.status, 'active');
});

test('blankEntry starts with no id (assigned from the title on save)', () => {
  assert.equal(blankEntry(schema).id, '');
});

test('blankEntry initializes list and gallery fields to arrays, others to empty strings', () => {
  const e = blankEntry(schema);
  assert.deepEqual(e.tags, []);
  assert.deepEqual(e.gallery, []);
  assert.deepEqual(e.factions, []); // multi-value reference starts as an array
  assert.equal(e.name, '');
  assert.equal(e.bio, '');
  assert.equal(e.favoriteNote, ''); // single-value reference stays an empty string
  assert.equal(e.heroImage, '');
});
