import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCodexExport,
  exportFilename,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
} from './exportCodex.js';

const EXPORTED_AT = '2026-08-11T09:30:00.000Z';

// ── buildCodexExport ────────────────────────────────────────────────────────────
test('buildCodexExport wraps meta, schemas, and entries in a versioned envelope', () => {
  const meta = { codexId: 'sanctum', name: 'Sanctum of Ash', description: 'A ruined temple.' };
  const schemas = [{ type: 'place', label: 'Places' }];
  const entries = [{ type: 'place', id: 'crypt', version: 3, name: 'The Crypt' }];

  const out = buildCodexExport({ meta, schemas, entries, exportedAt: EXPORTED_AT });

  assert.deepEqual(out, {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: EXPORTED_AT,
    codex: { codexId: 'sanctum', name: 'Sanctum of Ash', description: 'A ruined temple.' },
    schemas,
    entries,
  });
});

test('buildCodexExport emits entry and schema docs verbatim (archived kept, no field stripping)', () => {
  const schemas = [{ type: 'lore', label: 'Lore', status: 'archived', extra: { nested: true } }];
  const entries = [
    { type: 'lore', id: 'a', status: 'archived', version: 2, body: 'x', img: 'hash123' },
    { type: 'lore', id: 'b', status: 'active', version: 1 },
  ];
  const out = buildCodexExport({ meta: { codexId: 'c' }, schemas, entries, exportedAt: EXPORTED_AT });
  assert.deepEqual(out.schemas, schemas);
  assert.deepEqual(out.entries, entries);
});

test('buildCodexExport copies the schema/entry arrays (mutating state later does not alter the export)', () => {
  const schemas = [{ type: 'place' }];
  const entries = [{ type: 'place', id: 'x' }];
  const out = buildCodexExport({ meta: {}, schemas, entries, exportedAt: EXPORTED_AT });
  schemas.push({ type: 'sneaky' });
  entries.push({ type: 'place', id: 'sneaky' });
  assert.equal(out.schemas.length, 1);
  assert.equal(out.entries.length, 1);
});

test('buildCodexExport tolerates missing meta fields and empty collections', () => {
  const out = buildCodexExport({ exportedAt: EXPORTED_AT });
  assert.deepEqual(out.codex, { codexId: null, name: null, description: null });
  assert.deepEqual(out.schemas, []);
  assert.deepEqual(out.entries, []);
});

// ── exportFilename ──────────────────────────────────────────────────────────────
test('exportFilename slugs the codex name and stamps the UTC calendar day', () => {
  assert.equal(exportFilename({ name: 'Sanctum of Ash' }, EXPORTED_AT), 'sanctum-of-ash-2026-08-11.json');
});

test('exportFilename collapses punctuation and trims stray hyphens', () => {
  assert.equal(exportFilename({ name: "  Ael'thar: The Deep!  " }, EXPORTED_AT), 'ael-thar-the-deep-2026-08-11.json');
});

test('exportFilename falls back to "codex" when the name slugs to nothing', () => {
  assert.equal(exportFilename({ name: '///' }, EXPORTED_AT), 'codex-2026-08-11.json');
  assert.equal(exportFilename({}, EXPORTED_AT), 'codex-2026-08-11.json');
});
