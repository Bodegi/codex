import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, formatInline } from './inlineText.js';

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

test('formatInline resolves pool images through the injected resolver', () => {
  const resolve = (id) => (id === 'a.png' ? '/hashed/a.png' : null);
  assert.equal(
    formatInline('![alt](pool:a.png)', resolve),
    '<p><img class="inline-img" src="/hashed/a.png" alt="alt"></p>'
  );
});

test('formatInline shows a placeholder for an unresolved pool image', () => {
  const resolve = () => null;
  assert.equal(
    formatInline('![alt](pool:missing.png)', resolve),
    '<p><span class="missing-img">⚠ missing image: alt</span></p>'
  );
});
