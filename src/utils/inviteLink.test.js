import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseInviteToken, buildInviteUrl } from './inviteLink.js';

test('parseInviteToken pulls the token from a query string', () => {
  assert.equal(parseInviteToken('?invite=abc123'), 'abc123');
});

test('parseInviteToken works with a leading "invite=" and no "?"', () => {
  assert.equal(parseInviteToken('invite=abc123'), 'abc123');
});

test('parseInviteToken ignores other params and preserves the token verbatim', () => {
  assert.equal(parseInviteToken('?foo=1&invite=tok-XYZ&bar=2'), 'tok-XYZ');
});

test('parseInviteToken returns null when the param is absent', () => {
  assert.equal(parseInviteToken('?foo=1'), null);
  assert.equal(parseInviteToken(''), null);
  assert.equal(parseInviteToken(undefined), null);
});

test('parseInviteToken treats a blank invite= as absent', () => {
  assert.equal(parseInviteToken('?invite='), null);
  assert.equal(parseInviteToken('?invite=&foo=1'), null);
});

test('parseInviteToken decodes a percent-encoded token', () => {
  assert.equal(parseInviteToken('?invite=a%2Bb'), 'a+b');
});

test('buildInviteUrl composes origin + token', () => {
  assert.equal(buildInviteUrl('https://codex.app', 'tok1'), 'https://codex.app/?invite=tok1');
});

test('buildInviteUrl strips a trailing slash on the origin', () => {
  assert.equal(buildInviteUrl('https://codex.app/', 'tok1'), 'https://codex.app/?invite=tok1');
});

test('buildInviteUrl round-trips with parseInviteToken', () => {
  const url = buildInviteUrl('https://codex.app', 'tok-XYZ_123');
  assert.equal(parseInviteToken(new URL(url).search), 'tok-XYZ_123');
});
