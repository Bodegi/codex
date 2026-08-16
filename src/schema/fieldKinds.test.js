import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fieldKinds,
  getKind,
  getLayout,
  toList,
  displayValue,
  unknownKindPlaceholder,
  sampleValue,
  previewSample,
  paletteComponents,
} from './fieldKinds.js';

// --- text ---

test('text renderInput carries field-key/kind, escaped value, and a plain text input', () => {
  const html = fieldKinds.text.renderInput({ key: 'name', kind: 'text' }, 'Ada');
  assert.match(html, /data-field-key="name"/);
  assert.match(html, /data-field-kind="text"/);
  assert.match(html, /type="text"/);
  assert.match(html, /value="Ada"/);
});

test('text renderInput defaults to a text input and escapes the value', () => {
  const html = fieldKinds.text.renderInput({ key: 'name', kind: 'text' }, 'a "b"');
  assert.match(html, /type="text"/);
  assert.match(html, /value="a &quot;b&quot;"/);
});

test('text renderInput ignores a stray inputType — always plain text, never an arbitrary type=', () => {
  // inputType is retired (number/date/link/color graduate to first-class kinds, #31/#32). A leftover
  // value from legacy raw JSON must be ignored, not echoed into type="…".
  const html = fieldKinds.text.renderInput({ key: 'x', kind: 'text', inputType: 'evil" onx="1' }, '');
  assert.match(html, /type="text"/);
  assert.doesNotMatch(html, /onx=/);
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

test('list renderRead honors the display toggle (tags / inline), escaping items', () => {
  assert.equal(
    fieldKinds.list.renderRead({ key: 'e', display: 'tags' }, ['a', 'b']),
    '<ul class="field-tags"><li class="field-tag">a</li><li class="field-tag">b</li></ul>'
  );
  assert.equal(fieldKinds.list.renderRead({ key: 'e', display: 'inline' }, ['a', 'b']), '<p class="field-inline">a, b</p>');
  assert.match(fieldKinds.list.renderRead({ key: 'e', display: 'tags' }, ['<x>']), /&lt;x&gt;/);
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

test('reference renderInput preserves a set id when the target type has no entries', () => {
  // Empty list is truthy — the select would otherwise render as "— none —" and
  // the next save would wipe the stored id.
  const ctx = { listEntries: () => [] };
  const html = fieldKinds.reference.renderInput(
    { key: 'civilization', kind: 'reference', targetType: 'civilization' },
    'dwarves',
    ctx
  );
  assert.match(html, /<select/);
  assert.match(html, /<option value="dwarves" selected>dwarves \(unavailable\)<\/option>/);
});

test('reference renderInput preserves a dangling id not present in the entry list', () => {
  const ctx = {
    listEntries: () => [{ id: 'elves', label: 'Elves' }],
    resolveRef: (_type, id) => ({ label: id, exists: false }),
  };
  const html = fieldKinds.reference.renderInput(
    { key: 'civilization', kind: 'reference', targetType: 'civilization' },
    'dwarves',
    ctx
  );
  assert.match(html, /<option value="dwarves" selected>dwarves \(unavailable\)<\/option>/);
  assert.match(html, /<option value="elves">Elves<\/option>/);
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

// --- reference (multi) ---

test('multi reference renderInput builds a <select multiple> with stored ids selected', () => {
  const ctx = {
    listEntries: () => [
      { id: 'dwarves', label: 'Dwarves' },
      { id: 'orcs', label: 'Orcs' },
      { id: 'elves', label: 'Elves' },
    ],
  };
  const html = fieldKinds.reference.renderInput(
    { key: 'factions', kind: 'reference', targetType: 'civilization', multi: true },
    ['dwarves', 'orcs'],
    ctx
  );
  assert.match(html, /<select multiple/);
  assert.match(html, /data-multi="true"/);
  assert.match(html, /<option value="dwarves" selected>Dwarves<\/option>/);
  assert.match(html, /<option value="orcs" selected>Orcs<\/option>/);
  assert.match(html, /<option value="elves">Elves<\/option>/);
});

test('multi reference renderInput accepts a legacy comma string and preserves dangling ids', () => {
  const ctx = {
    listEntries: () => [{ id: 'elves', label: 'Elves' }],
    resolveRef: (_type, id) => ({ label: id, exists: false }),
  };
  const html = fieldKinds.reference.renderInput(
    { key: 'factions', kind: 'reference', targetType: 'civilization', multi: true },
    'dwarves, orcs',
    ctx
  );
  assert.match(html, /<option value="dwarves" selected>dwarves \(unavailable\)<\/option>/);
  assert.match(html, /<option value="orcs" selected>orcs \(unavailable\)<\/option>/);
  assert.match(html, /<option value="elves">Elves<\/option>/);
});

test('multi reference renderInput without ctx falls back to a comma text input carrying the ids', () => {
  const html = fieldKinds.reference.renderInput(
    { key: 'factions', kind: 'reference', targetType: 'civilization', multi: true },
    ['dwarves', 'orcs']
  );
  assert.match(html, /<input/);
  assert.match(html, /data-multi="true"/);
  assert.match(html, /value="dwarves, orcs"/);
});

test('multi reference renderRead links each resolvable target and mutes missing ones (default list)', () => {
  const ctx = {
    resolveRef: (_type, id) =>
      id === 'ghosts' ? { label: id, exists: false } : { label: id[0].toUpperCase() + id.slice(1), exists: true },
  };
  const html = fieldKinds.reference.renderRead(
    { targetType: 'civilization', multi: true },
    ['dwarves', 'ghosts'],
    ctx
  );
  assert.match(html, /<a [^>]*data-ref-id="dwarves"[^>]*>Dwarves<\/a>/);
  assert.match(html, /<span class="muted-ref"[^>]*>ghosts<\/span>/);
  assert.match(html, /^<ul><li>/); // default display is a bulleted list
});

test('multi reference renderRead honors display: inline (comma) and tags (pills)', () => {
  const ctx = { resolveRef: (_t, id) => ({ label: id[0].toUpperCase() + id.slice(1), exists: true }) };
  const inline = fieldKinds.reference.renderRead(
    { targetType: 'civilization', multi: true, display: 'inline' },
    ['dwarves', 'orcs'],
    ctx
  );
  assert.match(inline, /class="field-inline"/);
  assert.match(inline, /Dwarves<\/a>, <a/); // comma-separated
  const tags = fieldKinds.reference.renderRead(
    { targetType: 'civilization', multi: true, display: 'tags' },
    ['dwarves', 'orcs'],
    ctx
  );
  assert.match(tags, /class="field-tags"/);
  assert.match(tags, /<li class="field-tag"><a/);
});

test('multi reference renderRead with no ids renders a muted None', () => {
  assert.match(fieldKinds.reference.renderRead({ targetType: 'civilization', multi: true }, []), /class="muted"/);
});

test('displayValue joins multi-reference labels', () => {
  const ctx = { resolveRef: (_t, id) => ({ label: id.toUpperCase(), exists: true }) };
  assert.equal(
    displayValue({ kind: 'reference', targetType: 'civilization', multi: true }, ['dwarves', 'orcs'], ctx),
    'DWARVES, ORCS'
  );
  assert.equal(displayValue({ kind: 'reference', targetType: 'civilization', multi: true }, [], ctx), '');
});

// --- number ---

test('number renderInput is a number input carrying field-key/kind + escaped value', () => {
  const html = fieldKinds.number.renderInput({ key: 'pop', kind: 'number' }, 42);
  assert.match(html, /type="number"/);
  assert.match(html, /data-field-key="pop"/);
  assert.match(html, /data-field-kind="number"/);
  assert.match(html, /value="42"/);
});

test('number renderRead shows the value; empty renders a muted placeholder', () => {
  assert.match(fieldKinds.number.renderRead({ key: 'pop' }, 42), /<p>42<\/p>/);
  assert.match(fieldKinds.number.renderRead({ key: 'pop' }, ''), /class="muted"/);
});

// --- date ---

test('date renderInput is a date input carrying field-key/kind + value', () => {
  const html = fieldKinds.date.renderInput({ key: 'founded', kind: 'date' }, '2025-01-01');
  assert.match(html, /type="date"/);
  assert.match(html, /data-field-kind="date"/);
  assert.match(html, /value="2025-01-01"/);
});

test('date renderRead shows the value; empty renders a muted placeholder', () => {
  assert.match(fieldKinds.date.renderRead({ key: 'founded' }, '2025-01-01'), /2025-01-01/);
  assert.match(fieldKinds.date.renderRead({ key: 'founded' }, ''), /class="muted"/);
});

// --- select ---

test('select renderInput builds options from field.options with the current value selected', () => {
  const html = fieldKinds.select.renderInput(
    { key: 'tier', kind: 'select', options: ['Gold', 'Silver'] },
    'Silver'
  );
  assert.match(html, /<select/);
  assert.match(html, /data-field-kind="select"/);
  assert.match(html, /<option value="">— none —<\/option>/);
  assert.match(html, /<option value="Silver" selected>Silver<\/option>/);
  assert.match(html, /<option value="Gold">Gold<\/option>/);
});

test('select renderInput preserves a stored value no longer in the option list', () => {
  // A since-removed choice must survive edit → save, mirroring the reference control.
  const html = fieldKinds.select.renderInput({ key: 'tier', kind: 'select', options: ['Gold'] }, 'Bronze');
  assert.match(html, /<option value="Bronze" selected>Bronze \(unavailable\)<\/option>/);
  assert.match(html, /<option value="Gold">Gold<\/option>/);
});

test('select renderRead shows the chosen value; empty renders a muted placeholder', () => {
  assert.match(fieldKinds.select.renderRead({ key: 'tier' }, 'Gold'), /<p>Gold<\/p>/);
  assert.match(fieldKinds.select.renderRead({ key: 'tier' }, ''), /class="muted"/);
});

// --- select (multi) ---

test('multi select renderInput is a <select multiple> over field.options with stored values selected', () => {
  const html = fieldKinds.select.renderInput(
    { key: 'cats', kind: 'select', multi: true, options: ['Power', 'Magic', 'Storage'] },
    ['Power', 'Magic']
  );
  assert.match(html, /<select multiple/);
  assert.match(html, /data-field-kind="select"/);
  assert.match(html, /data-multi="true"/);
  assert.match(html, /<option value="Power" selected>Power<\/option>/);
  assert.match(html, /<option value="Magic" selected>Magic<\/option>/);
  assert.match(html, /<option value="Storage">Storage<\/option>/);
});

test('multi select renderInput carries a stored value no longer in the options as (unavailable)', () => {
  const html = fieldKinds.select.renderInput(
    { key: 'cats', kind: 'select', multi: true, options: ['Power'] },
    ['Power', 'Ritual']
  );
  assert.match(html, /<option value="Ritual" selected>Ritual \(unavailable\)<\/option>/);
  assert.match(html, /<option value="Power" selected>Power<\/option>/);
});

test('multi select renderRead defaults to a bulleted list and honors display modes', () => {
  const field = { key: 'cats', kind: 'select', multi: true };
  assert.equal(fieldKinds.select.renderRead(field, ['Power', 'Magic']), '<ul><li>Power</li><li>Magic</li></ul>');
  assert.match(fieldKinds.select.renderRead({ ...field, display: 'tags' }, ['Power']), /<li class="field-tag">Power<\/li>/);
  assert.match(fieldKinds.select.renderRead({ ...field, display: 'inline' }, ['Power', 'Magic']), /class="field-inline">Power, Magic</);
  assert.match(fieldKinds.select.renderRead(field, []), /class="muted"/);
});

test('multi select sampleValue is an array so the layout preview renders through the multi path', () => {
  assert.deepEqual(sampleValue({ kind: 'select', multi: true, options: ['A', 'B', 'C'], label: 'Cats' }), ['A', 'B']);
  assert.deepEqual(sampleValue({ kind: 'select', multi: true, options: [], label: 'Cats' }), ['Cats']);
});

// --- boolean ---

test('boolean renderInput is a checkbox, checked only when the value is truthy', () => {
  const on = fieldKinds.boolean.renderInput({ key: 'active', kind: 'boolean' }, true);
  assert.match(on, /type="checkbox"/);
  assert.match(on, /data-field-kind="boolean"/);
  assert.match(on, /checked/);
  const off = fieldKinds.boolean.renderInput({ key: 'active', kind: 'boolean' }, false);
  assert.doesNotMatch(off, /checked/);
});

test('boolean renderRead reads true as Yes and everything else as No', () => {
  assert.match(fieldKinds.boolean.renderRead({ key: 'active' }, true), /<p>Yes<\/p>/);
  assert.match(fieldKinds.boolean.renderRead({ key: 'active' }, false), /<p>No<\/p>/);
  assert.match(fieldKinds.boolean.renderRead({ key: 'active' }, undefined), /<p>No<\/p>/);
});

test('displayValue reads a boolean as Yes/No', () => {
  assert.equal(displayValue({ kind: 'boolean' }, true), 'Yes');
  assert.equal(displayValue({ kind: 'boolean' }, false), 'No');
});

// --- heading (structural break component) ---

test('heading renders its label as an <h2> in both the form and the read view, from field.label', () => {
  assert.equal(getLayout('heading'), 'break');
  assert.equal(fieldKinds.heading.renderInput({ key: 'h1', kind: 'heading', label: 'Lore & History' }), '<h2 class="form-heading">Lore &amp; History</h2>');
  assert.equal(fieldKinds.heading.renderRead({ key: 'h1', kind: 'heading', label: 'Lore & History' }), '<h2>Lore &amp; History</h2>');
});

test('heading has no per-entry value — displayValue is empty', () => {
  assert.equal(displayValue({ kind: 'heading', label: 'Details' }, undefined), '');
  assert.equal(displayValue({ kind: 'heading', label: 'Details' }, 'anything'), '');
});

// --- palette model ---

test('paletteComponents projects every registry kind as { kind, title, description, icon }', () => {
  const palette = paletteComponents();
  assert.equal(palette.length, Object.keys(fieldKinds).length);
  const select = palette.find((c) => c.kind === 'select');
  assert.equal(select.title, 'Select');
  assert.match(select.description, /fixed list/);
  assert.match(select.icon, /<svg/);
  // No jargon leaks: every component carries a human title distinct from its kind key.
  for (const c of palette) assert.ok(c.title && c.title !== c.kind ? true : c.title.length > 0);
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

test('the registry holds media alongside the pure kinds; getKind resolves them', () => {
  assert.equal(getKind('hero'), fieldKinds.hero);
  assert.equal(getKind('gallery'), fieldKinds.gallery);
  assert.equal(getKind('text'), fieldKinds.text);
  assert.equal(getKind('bogus'), null);
});

// --- layout contract ---

test('getLayout: pure text/reference are grid, prose/list are full, media is break', () => {
  assert.equal(getLayout('text'), 'grid');
  assert.equal(getLayout('reference'), 'grid');
  assert.equal(getLayout('prose'), 'full');
  assert.equal(getLayout('list'), 'full');
  assert.equal(getLayout('hero'), 'break');
  assert.equal(getLayout('gallery'), 'break');
  assert.equal(getLayout('bogus'), 'grid'); // unknown kinds fall back to grid
});

// --- hero (break component) ---

test('hero renderInput carries data-field-key on its root and a pick control', () => {
  const html = fieldKinds.hero.renderInput({ key: 'heroImage', label: 'Hero', kind: 'hero' }, '');
  assert.match(html, /data-field-key="heroImage"/);
  assert.match(html, /data-media="hero-pick"/);
  assert.match(html, /No hero image/);
  assert.doesNotMatch(html, /data-field-kind=/); // break roots are not scraped
});

test('hero renderInput shows a thumb + remove when a hero is set', () => {
  const ctx = { resolveImage: (id) => (id === 'h.png' ? '/i/h.png' : null) };
  const html = fieldKinds.hero.renderInput({ key: 'heroImage', label: 'Hero', kind: 'hero' }, 'h.png', ctx);
  assert.match(html, /src="\/i\/h.png"/);
  assert.match(html, /data-media="hero-clear"/);
});

test('hero renderRead: unset → empty, resolved → entry-hero img, unresolved → placeholder', () => {
  assert.equal(fieldKinds.hero.renderRead({ key: 'heroImage' }, ''), '');
  const ok = { resolveImage: (id) => (id === 'h.png' ? '/i/h.png' : null) };
  assert.match(fieldKinds.hero.renderRead({ key: 'heroImage' }, 'h.png', ok), /class="entry-hero" src="\/i\/h.png"/);
  const gone = { resolveImage: () => null };
  assert.match(fieldKinds.hero.renderRead({ key: 'heroImage' }, 'gone.png', gone), /image-missing-hero/);
});

// --- gallery (break component) ---

test('gallery renderInput carries data-field-key, renders thumbs + actions, and an add button', () => {
  const ctx = { resolveImage: (id) => `/i/${id}` };
  const html = fieldKinds.gallery.renderInput({ key: 'gallery', label: 'Gallery', kind: 'gallery' }, ['a.png', 'b.png'], ctx);
  assert.match(html, /data-field-key="gallery"/);
  assert.match(html, /data-media="gallery-add"/);
  assert.match(html, /data-media="gallery-remove" data-index="0"/);
  assert.match(html, /src="\/i\/a.png"/);
  assert.doesNotMatch(html, /data-field-kind=/);
});

test('gallery renderRead renders a carousel of the ids; empty → nothing', () => {
  const ctx = { resolveImage: (id) => `/i/${id}` };
  assert.match(fieldKinds.gallery.renderRead({ key: 'gallery' }, ['a.png'], ctx), /carousel/);
  assert.match(fieldKinds.gallery.renderRead({ key: 'gallery' }, ['a.png'], ctx), /src="\/i\/a.png"/);
  assert.equal(fieldKinds.gallery.renderRead({ key: 'gallery' }, [], ctx), '');
});

// --- map (break component) ---

test('map is a break, self-render component the registry resolves', () => {
  assert.equal(getKind('map'), fieldKinds.map);
  assert.equal(getLayout('map'), 'break');
  assert.equal(fieldKinds.map.selfRender, true);
});

test('map renderInput carries data-field-key + tools, resolves the backdrop, and is not scraped', () => {
  const ctx = { resolveImage: (id) => (id === 'm.png' ? '/i/m.png' : null) };
  const html = fieldKinds.map.renderInput(
    { key: 'map', label: 'World Map', kind: 'map' },
    { mapImageId: 'm.png', waypoints: [], roads: [], territories: [] },
    ctx
  );
  assert.match(html, /data-field-key="map"/);
  assert.match(html, /data-map-tool="waypoint"/);
  assert.match(html, /class="map-canvas-overlay"/);
  assert.match(html, /src="\/i\/m.png"/);
  assert.match(html, /World Map/);
  assert.doesNotMatch(html, /data-field-kind=/); // break roots report via mount, not scrape
});

test('map renderRead: empty → nothing, populated → a .map-read canvas carrying the value', () => {
  assert.equal(fieldKinds.map.renderRead({ key: 'map', label: 'Map' }, undefined), '');
  assert.equal(
    fieldKinds.map.renderRead({ key: 'map', label: 'Map' }, { mapImageId: '', waypoints: [], roads: [], territories: [] }),
    ''
  );
  const ctx = { resolveImage: (id) => `/i/${id}` };
  const html = fieldKinds.map.renderRead(
    { key: 'map', label: 'Map' },
    { mapImageId: 'm.png', waypoints: [{ id: '1', kind: 'waypoint', x: 5, y: 6, label: 'Pin' }], roads: [], territories: [] },
    ctx
  );
  assert.match(html, /class="map-wrapper map-read"/);
  assert.match(html, /data-map-value=/);
  assert.match(html, /src="\/i\/m.png"/);
});

// --- preview sample (filled Structure-editor previews) ---

test('sampleValue: text/list/reference → the field label', () => {
  assert.equal(sampleValue({ kind: 'text', label: 'Name' }), 'Name');
  assert.equal(sampleValue({ kind: 'list', label: 'Exports' }), 'Exports');
  assert.equal(sampleValue({ kind: 'reference', label: 'Favorite Note' }), 'Favorite Note');
});

test('sampleValue: prose → a lorem-ipsum snippet', () => {
  assert.match(sampleValue({ kind: 'prose', label: 'Bio' }), /^Lorem ipsum/);
});

test('sampleValue: media/map → a sentinel unresolvable value of the right shape', () => {
  const hero = sampleValue({ kind: 'hero', label: 'Hero' });
  assert.equal(typeof hero, 'string');
  assert.ok(hero); // truthy so hero renderRead emits the not-found frame, not nothing

  const gallery = sampleValue({ kind: 'gallery', label: 'Gallery' });
  assert.ok(Array.isArray(gallery) && gallery.length === 1);

  const map = sampleValue({ kind: 'map', label: 'Map' });
  assert.ok(map.mapImageId && Array.isArray(map.waypoints));

  // The media sentinels never resolve: hero/gallery/map all degrade to the not-found frame.
  const ctx = { resolveImage: () => null };
  assert.match(fieldKinds.hero.renderRead({ kind: 'hero' }, hero, ctx), /image-missing-hero/);
  assert.match(fieldKinds.map.renderRead({ kind: 'map', label: 'Map' }, map, ctx), /image-missing-map/);
});

test('sampleValue falls back to the label for a kind that declares none', () => {
  assert.equal(sampleValue({ kind: 'bogus', label: 'Whatever' }), 'Whatever');
  assert.equal(sampleValue({ kind: 'bogus' }), '');
});

test('previewSample maps every field through its kind, keyed by field key, plus the type', () => {
  const schema = {
    type: 'person',
    fields: [
      { key: 'name', kind: 'text', label: 'Name' },
      { key: 'bio', kind: 'prose', label: 'Bio' },
      { key: 'favoriteNote', kind: 'reference', label: 'Favorite Note' },
    ],
  };
  const sample = previewSample(schema);
  assert.equal(sample.type, 'person');
  assert.equal(sample.name, 'Name');
  assert.match(sample.bio, /^Lorem ipsum/);
  assert.equal(sample.favoriteNote, 'Favorite Note');
});

test('previewSample tolerates a schema with no fields', () => {
  assert.deepEqual(previewSample({ type: 'empty' }), { type: 'empty' });
});

test('unknownKindPlaceholder names the offending kind', () => {
  assert.match(unknownKindPlaceholder('bogus'), /unknown field kind/);
  assert.match(unknownKindPlaceholder('bogus'), /bogus/);
});
