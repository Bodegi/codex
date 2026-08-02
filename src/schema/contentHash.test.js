import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashBytes } from './contentHash.js';

const bytesOf = (s) => new TextEncoder().encode(s);

test('hashBytes returns the first 12 hex chars of the SHA-256 digest', async () => {
  // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
  assert.equal(await hashBytes(bytesOf('abc')), 'ba7816bf8f01');
});

test('hashBytes is deterministic for identical bytes', async () => {
  assert.equal(await hashBytes(bytesOf('dwarves')), await hashBytes(bytesOf('dwarves')));
});

test('hashBytes differs for different bytes', async () => {
  assert.notEqual(await hashBytes(bytesOf('dwarves')), await hashBytes(bytesOf('orcs')));
});

test('hashBytes accepts a raw ArrayBuffer as well as a Uint8Array', async () => {
  assert.equal(await hashBytes(bytesOf('abc').buffer), 'ba7816bf8f01');
});
