import { test } from 'node:test';
import assert from 'node:assert/strict';

import { uploadImage, labelFromFilename } from './imageUpload.js';

const bytesOf = (s) => new TextEncoder().encode(s);

// Fake byte + metadata ports backed by an in-memory map keyed by hash.
function fakes(seed = {}) {
  const uploads = [];
  const db = new Map(Object.entries(seed));
  const storage = {
    uploadBytes: async (hash, _bytes, contentType) => {
      uploads.push({ hash, contentType });
    },
  };
  const meta = {
    getImage: async (hash) => db.get(hash) || null,
    createImage: async (hash, data) => {
      db.set(hash, { ...data });
    },
    addImageToCodex: async (hash, codexId) => {
      const r = db.get(hash);
      r.codices = [...new Set([...(r.codices || []), codexId])];
    },
    setImageStatus: async (hash, status) => {
      db.get(hash).status = status;
    },
  };
  return { storage, meta, uploads, db };
}

const upload = (extra, ports) =>
  uploadImage(
    { bytes: bytesOf('img'), filename: 'a.png', contentType: 'image/png', codexId: 'atm10', uid: 'u1', ...extra },
    ports
  );

// --- new upload ------------------------------------------------------------

test('uploading new bytes stores the blob, then creates the metadata record', async () => {
  const ports = fakes();
  const id = await upload({ bytes: bytesOf('dwarves'), filename: 'dwarven-hall.png' }, ports);
  assert.equal(ports.uploads.length, 1);
  assert.equal(ports.uploads[0].hash, id);
  const rec = ports.db.get(id);
  assert.deepEqual(rec.codices, ['atm10']);
  assert.equal(rec.status, 'active');
  assert.equal(rec.label, 'Dwarven Hall');
  assert.equal(rec.uploadedBy, 'u1');
});

// --- dedup -----------------------------------------------------------------

test('re-uploading identical bytes into a new codex dedups: no second blob, adds the codex', async () => {
  const ports = fakes();
  const id = await upload({ bytes: bytesOf('same'), codexId: 'atm10' }, ports);
  await upload({ bytes: bytesOf('same'), codexId: 'campaign', uid: 'u2' }, ports);
  assert.equal(ports.uploads.length, 1);
  assert.deepEqual(ports.db.get(id).codices, ['atm10', 'campaign']);
});

test('re-uploading into a codex it already belongs to leaves membership unchanged', async () => {
  const ports = fakes();
  const id = await upload({ bytes: bytesOf('x') }, ports);
  await upload({ bytes: bytesOf('x') }, ports);
  assert.deepEqual(ports.db.get(id).codices, ['atm10']);
  assert.equal(ports.uploads.length, 1);
});

// --- resurrect -------------------------------------------------------------

test('re-uploading an archived image resurrects it and re-adds the codex, without re-uploading bytes', async () => {
  const ports = fakes();
  const id = await upload({ bytes: bytesOf('y') }, ports);
  await ports.meta.setImageStatus(id, 'archived');
  ports.db.get(id).codices = [];
  await upload({ bytes: bytesOf('y') }, ports);
  assert.equal(ports.db.get(id).status, 'active');
  assert.deepEqual(ports.db.get(id).codices, ['atm10']);
  assert.equal(ports.uploads.length, 1);
});

// --- failure ordering ------------------------------------------------------

test('bytes are uploaded before metadata is written (safe failure ordering)', async () => {
  const order = [];
  const storage = { uploadBytes: async () => order.push('bytes') };
  const meta = {
    getImage: async () => null,
    createImage: async () => order.push('meta'),
    addImageToCodex: async () => {},
    setImageStatus: async () => {},
  };
  await upload({}, { storage, meta });
  assert.deepEqual(order, ['bytes', 'meta']);
});

// --- labelFromFilename -----------------------------------------------------

test('labelFromFilename prettifies the base name', () => {
  assert.equal(labelFromFilename('dwarven-hall.png'), 'Dwarven Hall');
  assert.equal(labelFromFilename('city_waterway.JPG'), 'City Waterway');
});

test('labelFromFilename falls back to Untitled when nothing is left', () => {
  assert.equal(labelFromFilename('.png'), 'Untitled');
  assert.equal(labelFromFilename(''), 'Untitled');
});
