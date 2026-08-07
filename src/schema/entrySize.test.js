import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkEntrySize,
  estimateEntryBytes,
  ENTRY_SIZE_LIMIT_BYTES,
  FIRESTORE_DOC_LIMIT_BYTES,
} from './entrySize.js';

test('the guard limit sits below Firestore\'s hard document cap', () => {
  assert.ok(ENTRY_SIZE_LIMIT_BYTES < FIRESTORE_DOC_LIMIT_BYTES);
});

test('estimates UTF-8 byte length, not character count', () => {
  // "€" is 3 UTF-8 bytes; JSON.stringify wraps a string in two quotes (2 bytes).
  assert.equal(estimateEntryBytes('€'), 2 + 3);
});

test('a small entry is ok, with byte count and limit reported', () => {
  const res = checkEntrySize({ name: 'Dwarves', body: 'A short entry.' });
  assert.equal(res.ok, true);
  assert.equal(res.limit, ENTRY_SIZE_LIMIT_BYTES);
  assert.ok(res.bytes > 0 && res.bytes < 200);
});

test('an entry over the limit is rejected with a friendly message', () => {
  const huge = { body: 'x'.repeat(ENTRY_SIZE_LIMIT_BYTES + 1) };
  const res = checkEntrySize(huge);
  assert.equal(res.ok, false);
  assert.ok(res.bytes > ENTRY_SIZE_LIMIT_BYTES);
  assert.match(res.message, /too large/i);
  assert.match(res.message, /KB/); // reports sizes so the author knows how far over
});

test('exactly at the limit is allowed; one byte over is not', () => {
  // Build a JSON payload whose serialized byte length is exactly the (tiny) limit.
  const limit = 20;
  const pad = 'x'.repeat(limit - '{"b":""}'.length);
  const atLimit = { b: pad };
  assert.equal(estimateEntryBytes(atLimit), limit);
  assert.equal(checkEntrySize(atLimit, limit).ok, true);
  assert.equal(checkEntrySize({ b: pad + 'x' }, limit).ok, false);
});

test('non-serializable payloads are treated as over-limit, never throw', () => {
  const circular = {};
  circular.self = circular;
  assert.equal(estimateEntryBytes(circular), Infinity);
  assert.equal(checkEntrySize(circular).ok, false);
});
