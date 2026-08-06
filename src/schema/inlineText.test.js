import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, formatInline } from './inlineText.js';
import { notFoundImage } from './notFoundImage.js';

test('escapeHtml neutralizes HTML metacharacters', () => {
  assert.equal(escapeHtml('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
});

test('formatInline returns empty string for blank input', () => {
  assert.equal(formatInline(''), '');
  assert.equal(formatInline(null), '');
});

test('formatInline wraps a paragraph and escapes content', () => {
  assert.equal(formatInline('a < b'), '<p>a &lt; b</p>');
});

test('formatInline splits blank-line-separated paragraphs', () => {
  assert.equal(formatInline('one\n\ntwo'), '<p>one</p><p>two</p>');
});

test('formatInline turns single newlines into <br>', () => {
  assert.equal(formatInline('one\ntwo'), '<p>one<br>two</p>');
});

test('formatInline renders "- " lines as an unordered list', () => {
  assert.equal(formatInline('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});

test('formatInline applies bold and italic marks', () => {
  assert.equal(formatInline('**b** and *i*'), '<p><strong>b</strong> and <em>i</em></p>');
});

test('formatInline renders links with safe attributes', () => {
  assert.equal(
    formatInline('[x](http://e.com)'),
    '<p><a href="http://e.com" target="_blank" rel="noopener">x</a></p>'
  );
});

test('formatInline passes through non-pool image urls', () => {
  assert.equal(
    formatInline('![alt](http://e.com/a.png)'),
    '<p><img class="inline-img" src="http://e.com/a.png" alt="alt"></p>'
  );
});

test('formatInline resolves img: images through the injected resolver', () => {
  const resolve = (id) => (id === 'a.png' ? '/hashed/a.png' : null);
  assert.equal(
    formatInline('![alt](img:a.png)', resolve),
    '<p><img class="inline-img" src="/hashed/a.png" alt="alt"></p>'
  );
});

test('formatInline still resolves the legacy pool: prefix', () => {
  const resolve = (id) => (id === 'a.png' ? '/hashed/a.png' : null);
  assert.equal(
    formatInline('![alt](pool:a.png)', resolve),
    '<p><img class="inline-img" src="/hashed/a.png" alt="alt"></p>'
  );
});

test('formatInline shows the not-found placeholder for an unresolved img: reference', () => {
  const resolve = () => null;
  assert.equal(
    formatInline('![alt](img:missing.png)', resolve),
    `<p>${notFoundImage('image-missing-inline')}</p>`
  );
});

// ── URL-scheme allowlist (technical review T1: stored XSS via javascript: links) ──

test('formatInline strips a javascript: link to inert label text', () => {
  assert.equal(formatInline('[click](javascript:alert)'), '<p>click</p>');
});

test('formatInline strips data: and vbscript: link schemes', () => {
  assert.equal(formatInline('[a](data:text/html,evil)'), '<p>a</p>');
  assert.equal(formatInline('[b](vbscript:msgbox)'), '<p>b</p>');
});

test('formatInline defeats control-char scheme obfuscation (java\\tscript:)', () => {
  assert.equal(formatInline('[x](java\tscript:alert)'), '<p>x</p>');
  assert.equal(formatInline('[x](  JavaScript:alert)'), '<p>x</p>');
});

test('formatInline keeps mailto and relative/anchor links', () => {
  assert.equal(
    formatInline('[m](mailto:a@b.com)'),
    '<p><a href="mailto:a@b.com" target="_blank" rel="noopener">m</a></p>'
  );
  assert.equal(
    formatInline('[a](#anchor)'),
    '<p><a href="#anchor" target="_blank" rel="noopener">a</a></p>'
  );
});

test('formatInline drops an unsafe image scheme to the not-found placeholder', () => {
  assert.equal(
    formatInline('![x](javascript:alert)'),
    `<p>${notFoundImage('image-missing-inline')}</p>`
  );
});
