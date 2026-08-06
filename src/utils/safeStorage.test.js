import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getItem, setItem, removeItem } from './safeStorage.js';

// Swap globalThis.localStorage for the duration of `fn`, restoring it after (Node has none by default).
function withStorage(impl, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  globalThis.localStorage = impl;
  try {
    fn();
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
}

// A throwing store models Safari private mode / disabled site data (access throws, not returns null).
const throwingStore = {
  getItem() { throw new Error('storage disabled'); },
  setItem() { throw new Error('storage disabled'); },
  removeItem() { throw new Error('storage disabled'); },
};

test('getItem returns null instead of throwing when storage throws', () => {
  withStorage(throwingStore, () => {
    assert.equal(getItem('k'), null);
  });
});

test('setItem / removeItem return false instead of throwing when storage throws', () => {
  withStorage(throwingStore, () => {
    assert.equal(setItem('k', 'v'), false);
    assert.equal(removeItem('k'), false);
  });
});

test('reads/writes work against a real store', () => {
  const map = new Map();
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  withStorage(store, () => {
    assert.equal(getItem('k'), null);
    assert.equal(setItem('k', 'v'), true);
    assert.equal(getItem('k'), 'v');
    assert.equal(removeItem('k'), true);
    assert.equal(getItem('k'), null);
  });
});

test('getItem tolerates localStorage being entirely absent', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  if (had) delete globalThis.localStorage;
  try {
    assert.equal(getItem('k'), null);
    assert.equal(setItem('k', 'v'), false);
  } finally {
    if (had) globalThis.localStorage = prev;
  }
});
