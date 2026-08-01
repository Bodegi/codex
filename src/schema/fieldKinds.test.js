import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fieldKinds,
  getKind,
  MEDIA_KINDS,
  toList,
  displayValue,
  unknownKindPlaceholder,
} from './fieldKinds.js';

// --- text ---

test('text renderInput carries field-key/kind, escaped value, and inputType', () => {
  const html = fieldKinds.text.renderInput({ key: 'date', kind: 'text', inputType: 'date' }, '2026-08-01');
  assert.match(html, /data-field-key="date"/);
  assert.match(html, /data-field-kind="text"/);
  assert.match(html, /type="date"/);
  assert.match(html, /value="2026-08-01"/);
});

test('text renderInput defaults to a text input and escapes the value', () => {
  const html = fieldKinds.text.renderInput({ key: 'name', kind: 'text' }, 'a "b"');
  assert.match(html, /type="text"/);
  assert.match(html, /value="a &quot;b&quot;"/);
});

test('text renderRead escapes the value; empty renders a muted placeholder', () => {
  assert.match(fieldKinds.text.renderRead({ key: 'name' }, 'a < b'), /a &lt; b/);
  assert.match(fieldKinds.text.renderRead({ key: 'name' }, ''), /class="muted"/);
});

// --- prose ---

test('prose renderInput is a textarea carrying field-key/kind', () => {
  const html = fieldKinds.prose.renderInput({ key: 'history', kind: 'prose' }, 'text');
  assert.match(html, /<textarea/);
  assert.match(html, /data-field-key="history"/);
  assert.match(html, /data-field-kind="prose"/);
});

test('prose renderRead runs formatInline and resolves pool images via ctx', () => {
  const ctx = { resolveImage: (id) => (id === 'a.png' ? '/h/a.png' : null) };
  const html = fieldKinds.prose.renderRead({ key: 'b' }, '**bold** ![x](pool:a.png)', ctx);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /src="\/h\/a.png"/);
});

// --- list ---

test('list renderInput is a newline-per-item textarea carrying field-key/kind', () => {
  const html = fieldKinds.list.renderInput({ key: 'exports', kind: 'list' }, ['Iron', 'Tools']);
  assert.match(html, /<textarea/);
  assert.match(html, /data-field-key="exports"/);
  assert.match(html, /data-field-kind="list"/);
  assert.match(html, />Iron\nTools</);
});

test('list renderRead renders a <ul> of items; empty renders a muted placeholder', () => {
  assert.equal(fieldKinds.list.renderRead({ key: 'e' }, ['a', 'b']), '<ul><li>a</li><li>b</li></ul>');
  assert.match(fieldKinds.list.renderRead({ key: 'e' }, []), /class="muted"/);
});

// --- reference ---

test('reference renderInput builds a select from ctx.listEntries with the current value selected', () => {
  const ctx = { listEntries: (type) => (type === 'civilization' ? [{ id: 'dwarves', label: 'Dwarves' }] : []) };
  const html = fieldKinds.reference.renderInput(
    { key: 'civilization', kind: 'reference', targetType: 'civilization' },
    'dwarves',
    ctx
  );
  assert.match(html, /<select/);
  assert.match(html, /data-field-key="civilization"/);
  assert.match(html, /<option value="dwarves" selected>Dwarves<\/option>/);
});

test('reference renderInput without ctx falls back to a text input carrying the id', () => {
  const html = fieldKinds.reference.renderInput({ key: 'civilization', kind: 'reference' }, 'dwarves');
  assert.match(html, /<input/);
  assert.match(html, /value="dwarves"/);
  assert.match(html, /data-field-kind="reference"/);
});

test('reference renderRead links a resolvable target and mutes a missing one', () => {
  const ctx = {
    resolveRef: (type, id) => (id === 'dwarves' ? { label: 'Dwarves', exists: true } : { label: id, exists: false }),
  };
  const linked = fieldKinds.reference.renderRead({ targetType: 'civilization' }, 'dwarves', ctx);
  assert.match(linked, /<a [^>]*data-ref-type="civilization"[^>]*data-ref-id="dwarves"[^>]*>Dwarves<\/a>/);

  const missing = fieldKinds.reference.renderRead({ targetType: 'civilization' }, 'ghosts', ctx);
  assert.doesNotMatch(missing, /<a /);
  assert.match(missing, /ghosts/);
});

test('reference renderRead with no value renders a muted None', () => {
  assert.match(fieldKinds.reference.renderRead({ targetType: 'civilization' }, ''), /class="muted"/);
});

// --- helpers ---

test('toList splits comma strings and passes arrays through', () => {
  assert.deepEqual(toList('a, b ,c'), ['a', 'b', 'c']);
  assert.deepEqual(toList(['x', 'y']), ['x', 'y']);
  assert.deepEqual(toList(''), []);
});

test('displayValue joins lists and resolves reference labels', () => {
  assert.equal(displayValue({ kind: 'list' }, ['a', 'b']), 'a, b');
  const ctx = { resolveRef: () => ({ label: 'Dwarves', exists: true }) };
  assert.equal(displayValue({ kind: 'reference', targetType: 'civilization' }, 'dwarves', ctx), 'Dwarves');
  assert.equal(displayValue({ kind: 'text' }, 'plain'), 'plain');
});

test('MEDIA_KINDS marks hero and gallery; getKind returns null for them and unknowns', () => {
  assert.ok(MEDIA_KINDS.has('hero'));
  assert.ok(MEDIA_KINDS.has('gallery'));
  assert.equal(getKind('hero'), null);
  assert.equal(getKind('bogus'), null);
  assert.equal(getKind('text'), fieldKinds.text);
});

test('unknownKindPlaceholder names the offending kind', () => {
  assert.match(unknownKindPlaceholder('bogus'), /unknown field kind/);
  assert.match(unknownKindPlaceholder('bogus'), /bogus/);
});
