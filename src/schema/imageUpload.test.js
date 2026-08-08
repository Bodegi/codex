import { test } from 'node:test';
import assert from 'node:assert/strict';

import { uploadImage, labelFromFilename, validateImageFile, MAX_IMAGE_BYTES } from './imageUpload.js';
import { hashBytes } from './contentHash.js';

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

// --- compress port ---------------------------------------------------------

test('on a miss, the compress port shapes the stored bytes/type — but the id stays the source hash', async () => {
  const ports = fakes();
  const compress = async () => ({ bytes: bytesOf('webp'), contentType: 'image/webp' });
  const sourceId = await hashBytes(bytesOf('source'));
  const id = await upload({ bytes: bytesOf('source'), contentType: 'image/png' }, { ...ports, compress });
  assert.equal(id, sourceId); // hashed from the source, not the compressed output
  assert.equal(ports.uploads[0].hash, sourceId);
  assert.equal(ports.uploads[0].contentType, 'image/webp'); // stored as what compress returned
});

test('a dedup hit never invokes the compress port (no wasted encode on re-upload)', async () => {
  const ports = fakes();
  let calls = 0;
  const compress = async () => (calls++, { bytes: bytesOf('webp'), contentType: 'image/webp' });
  await upload({ bytes: bytesOf('dup') }, { ...ports, compress });
  await upload({ bytes: bytesOf('dup'), codexId: 'other' }, { ...ports, compress });
  assert.equal(calls, 1); // second (dedup) upload skips compression
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

// ── validateImageFile (type + size gate) ──

test('validateImageFile accepts a normal raster image under the cap', () => {
  assert.equal(validateImageFile({ type: 'image/png', size: 1024 }), null);
  assert.equal(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES }), null);
});

test('validateImageFile rejects a non-image file', () => {
  assert.match(validateImageFile({ type: 'application/pdf', size: 10 }), /image files/i);
  assert.match(validateImageFile({ type: '', size: 10 }), /image files/i);
});

test('validateImageFile rejects SVG specifically', () => {
  assert.match(validateImageFile({ type: 'image/svg+xml', size: 10 }), /svg/i);
});

test('validateImageFile rejects a file over the size cap', () => {
  assert.match(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /too large/i);
});

test('validateImageFile honors a custom maxBytes', () => {
  assert.equal(validateImageFile({ type: 'image/png', size: 500 }, { maxBytes: 1000 }), null);
  assert.match(validateImageFile({ type: 'image/png', size: 1500 }, { maxBytes: 1000 }), /too large/i);
});
