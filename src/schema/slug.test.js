import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugify, isSlugTaken, uniqueSlug, deriveEntryId } from './slug.js';

// --- slugify ---------------------------------------------------------------

test('slugify lowercases and collapses non-alphanumeric runs to single dashes', () => {
  assert.equal(slugify('My D&D Campaign'), 'my-d-d-campaign');
});

test('slugify trims leading and trailing separators', () => {
  assert.equal(slugify('  Hello, World!  '), 'hello-world');
});

test('slugify collapses repeated separators', () => {
  assert.equal(slugify('a --- b   c'), 'a-b-c');
});

test('slugify preserves digits', () => {
  assert.equal(slugify('Season 2'), 'season-2');
});

test('slugify returns empty string when there is nothing alphanumeric', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('   '), '');
});

test('slugify tolerates null/undefined input', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});

// --- isSlugTaken -----------------------------------------------------------

test('isSlugTaken is true when the slug already exists', () => {
  assert.equal(isSlugTaken('atm10', ['atm10', 'campaign']), true);
});

test('isSlugTaken is false when the slug is free', () => {
  assert.equal(isSlugTaken('new-codex', ['atm10', 'campaign']), false);
});

// --- uniqueSlug ------------------------------------------------------------

test('uniqueSlug returns the base when it is free', () => {
  assert.equal(uniqueSlug('goblin', []), 'goblin');
  assert.equal(uniqueSlug('goblin', ['orc']), 'goblin');
});

test('uniqueSlug suffixes -2 on the first collision', () => {
  assert.equal(uniqueSlug('goblin', ['goblin']), 'goblin-2');
});

test('uniqueSlug walks the suffix past a run of collisions', () => {
  assert.equal(uniqueSlug('goblin', ['goblin', 'goblin-2', 'goblin-3']), 'goblin-4');
});

// --- deriveEntryId ---------------------------------------------------------

test('deriveEntryId slugs the title and keeps it unique within the type', () => {
  assert.equal(deriveEntryId('Goblin King', []), 'goblin-king');
  assert.equal(deriveEntryId('Goblin King', ['goblin-king']), 'goblin-king-2');
});

test('deriveEntryId falls back to "entry" when the title has nothing sluggable', () => {
  assert.equal(deriveEntryId('', []), 'entry');
  assert.equal(deriveEntryId('   ', ['entry']), 'entry-2');
});
