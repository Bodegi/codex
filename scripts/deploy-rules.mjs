/**
 * Deploy firestore.rules to the configured project via the Firebase Rules REST API — replaces the
 * old copy-paste-into-the-console step. Dependency-free (Node built-ins + REST), same gitignored
 * service-account key as scripts/dev-mint-token.mjs.
 *
 *   node scripts/deploy-rules.mjs
 *
 * Two steps, in order, because the first is a validation gate:
 *   1) create a Ruleset from firestore.rules — the API compiles it and REJECTS invalid syntax here,
 *      so a broken file never reaches the live release;
 *   2) point the `cloud.firestore` release at the new ruleset (PATCH existing; CREATE if absent).
 *
 * Project id comes from .firebaserc (default) unless FIREBASE_PROJECT overrides it. The key path is
 * GOOGLE_APPLICATION_CREDENTIALS or .secrets/firebase-deploy.json. Prints the ruleset id on success.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/firebase-deploy.json';
const RULES_PATH = 'firestore.rules';
const RELEASE = 'cloud.firestore'; // the Firestore release name (the release set also has firebase.storage)

const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const projectId =
  process.env.FIREBASE_PROJECT ||
  (() => {
    try {
      return JSON.parse(readFileSync('.firebaserc', 'utf8')).projects?.default;
    } catch {
      return null;
    }
  })() ||
  sa.project_id;
if (!projectId) throw new Error('No project id (set FIREBASE_PROJECT or .firebaserc default).');

const API = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;
const nowSec = Math.floor(Date.now() / 1000);
const b64url = (input) => Buffer.from(input).toString('base64url');

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(sa.private_key).toString('base64url')}`;
}

// Service-account OAuth access token (JWT-bearer grant), scoped for the Firebase Rules API.
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

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const token = await getAccessToken();
const content = readFileSync(RULES_PATH, 'utf8');

// 1) Create + validate the ruleset. Invalid rules are rejected here (400) before any release change.
const created = await api('POST', '/rulesets', {
  source: { files: [{ name: RULES_PATH, content }] },
});
if (!created.ok) throw new Error(`Ruleset create failed (${created.status}): ${JSON.stringify(created.json)}`);
const rulesetName = created.json.name; // projects/{id}/rulesets/{uuid}
console.log(`✓ ruleset created & validated: ${rulesetName}`);

// 2) Point the cloud.firestore release at it — PATCH the existing release, CREATE it if none exists.
const releaseName = `projects/${projectId}/releases/${RELEASE}`;
const patched = await api('PATCH', `/releases/${RELEASE}`, {
  release: { name: releaseName, rulesetName },
});
if (!patched.ok && patched.status === 404) {
  const createdRel = await api('POST', '/releases', { name: releaseName, rulesetName });
  if (!createdRel.ok) throw new Error(`Release create failed (${createdRel.status}): ${JSON.stringify(createdRel.json)}`);
  console.log(`✓ release created: ${RELEASE}`);
} else if (!patched.ok) {
  throw new Error(`Release update failed (${patched.status}): ${JSON.stringify(patched.json)}`);
} else {
  console.log(`✓ release updated: ${RELEASE}`);
}

console.log(`\nDeployed ${RULES_PATH} → ${projectId} (${RELEASE}).`);
