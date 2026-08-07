/**
 * Verify firestore.rules against the invite-gate scenarios via the Firebase Rules Test API — a
 * credential-free way to prove the deployed gate allows/denies the right requests, with nobody
 * signing in. Dependency-free (Node built-ins + REST), same key as scripts/deploy-rules.mjs.
 *
 *   node scripts/test-rules.mjs
 *
 * Sends the LOCAL firestore.rules source + a suite of simulated requests (auth context, method,
 * path, incoming/existing data, and get()/exists() mocks for the invites lookup) to
 * projects.test; prints PASS/FAIL per case and exits non-zero on any failure. Run it after editing
 * the rules and before `npm run deploy:rules`.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/firebase-deploy.json';
const RULES_PATH = 'firestore.rules';
const ADMIN_EMAIL = 'bodegigaming@gmail.com'; // matches the isAdmin() allowlist in the rules
const DB = '/databases/(default)/documents';
const NOW = '2026-08-07T00:00:00.000Z';
const FUTURE_MS = Date.UTC(2027, 0, 1);
const PAST_MS = Date.UTC(2026, 0, 1);

const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const projectId = process.env.FIREBASE_PROJECT || sa.project_id;
const nowSec = Math.floor(Date.now() / 1000);
const b64url = (input) => Buffer.from(input).toString('base64url');

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(sa.private_key).toString('base64url')}`;
}

async function getAccessToken() {
  const assertion = signJwt({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const json = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })).json();
  if (!json.access_token) throw new Error('OAuth token error: ' + JSON.stringify(json));
  return json.access_token;
}

// get()/exists() mocks for an invites/{token} lookup with a given status + expiry.
const inviteMocks = (token, { status = 'active', expiresAt = FUTURE_MS, exists = true } = {}) => {
  const path = `${DB}/invites/${token}`;
  const arg = [{ exactValue: path }];
  return [
    { function: 'exists', args: arg, result: { value: exists } },
    { function: 'get', args: arg, result: { value: { data: { status, expiresAt } } } },
  ];
};

const userData = (extra = {}) => ({
  uid: 'u1', email: 'u1@x.com', displayName: 'U One', photoURL: null, lastSeenAt: NOW, ...extra,
});

// Each case: a human label, expectation, and the simulated request (+ optional resource / mocks).
const CASES = [
  {
    label: 'new non-admin, NO invite → users create DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/users/u1`, time: NOW, resource: { data: userData() } },
  },
  {
    label: 'new non-admin, VALID invite → users create ALLOW',
    expectation: 'ALLOW',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-good' }) } },
    functionMocks: inviteMocks('tok-good'),
  },
  {
    label: 'new non-admin, EXPIRED invite → users create DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-exp' }) } },
    functionMocks: inviteMocks('tok-exp', { expiresAt: PAST_MS }),
  },
  {
    label: 'new non-admin, REVOKED invite → users create DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-rev' }) } },
    functionMocks: inviteMocks('tok-rev', { status: 'revoked' }),
  },
  {
    label: 'new non-admin, token names a MISSING invite → users create DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-none' }) } },
    functionMocks: inviteMocks('tok-none', { exists: false }),
  },
  {
    label: 'admin, NO invite → users create ALLOW (bypasses gate)',
    expectation: 'ALLOW',
    request: { auth: { uid: 'admin1', token: { email: ADMIN_EMAIL } }, method: 'create', path: `${DB}/users/admin1`, time: NOW, resource: { data: userData({ uid: 'admin1', email: ADMIN_EMAIL }) } },
  },
  {
    label: 'returning user (row exists), invitedVia unchanged → users update ALLOW',
    expectation: 'ALLOW',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'update', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-good' }) } },
    resource: { data: userData({ invitedVia: 'tok-good' }) },
  },
  {
    label: 'legacy user (no invitedVia either side) → users update ALLOW (missing-safe)',
    expectation: 'ALLOW',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'update', path: `${DB}/users/u1`, time: NOW, resource: { data: userData() } },
    resource: { data: userData() },
  },
  {
    label: 'returning user tries to REWRITE invitedVia → users update DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'update', path: `${DB}/users/u1`, time: NOW, resource: { data: userData({ invitedVia: 'tok-forged' }) } },
    resource: { data: userData({ invitedVia: 'tok-good' }) },
  },
  {
    label: 'signed-in non-admin, get an invite by exact token → invites get ALLOW',
    expectation: 'ALLOW',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'get', path: `${DB}/invites/tok-good`, time: NOW },
  },
  {
    label: 'non-admin tries to enumerate invites → invites list DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'list', path: `${DB}/invites/tok-good`, time: NOW },
  },
  {
    label: 'non-admin tries to create an invite → invites write DENY',
    expectation: 'DENY',
    request: { auth: { uid: 'u1', token: { email: 'u1@x.com' } }, method: 'create', path: `${DB}/invites/tok-x`, time: NOW, resource: { data: { token: 'tok-x', status: 'active' } } },
  },
  {
    label: 'admin creates an invite → invites write ALLOW',
    expectation: 'ALLOW',
    request: { auth: { uid: 'admin1', token: { email: ADMIN_EMAIL } }, method: 'create', path: `${DB}/invites/tok-x`, time: NOW, resource: { data: { token: 'tok-x', status: 'active' } } },
  },
];

const token = await getAccessToken();
const source = { files: [{ name: RULES_PATH, content: readFileSync(RULES_PATH, 'utf8') }] };
const testSuite = {
  testCases: CASES.map((c) => ({
    expectation: c.expectation,
    request: c.request,
    ...(c.resource ? { resource: c.resource } : {}),
    ...(c.functionMocks ? { functionMocks: c.functionMocks } : {}),
    pathEncoding: 'PLAIN',
  })),
};

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}:test`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source, testSuite }),
});
const json = await res.json();
if (!res.ok) throw new Error(`test API error (${res.status}): ${JSON.stringify(json)}`);
if (json.issues?.length) {
  console.error('Ruleset compile issues:', JSON.stringify(json.issues, null, 2));
  process.exit(1);
}

let failed = 0;
json.testResults.forEach((r, i) => {
  const ok = r.state === 'SUCCESS';
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} [${CASES[i].expectation.padEnd(5)}] ${CASES[i].label}`);
  if (!ok && r.debugMessages?.length) r.debugMessages.forEach((m) => console.log(`    ↳ ${m}`));
});

console.log(`\n${json.testResults.length - failed}/${json.testResults.length} passed.`);
process.exit(failed ? 1 : 0);
