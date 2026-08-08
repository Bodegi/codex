import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newId } from './id.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newId returns a UUID v4 string', () => {
  assert.match(newId(), UUID_V4);
});

test('newId yields a distinct id on each call', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  assert.equal(ids.size, 1000);
});
