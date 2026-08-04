/**
 * Dev-only: mint a Firebase custom token so an automated browser can sign in as a real user without
 * the Google popup. Pairs with AuthManager.loginWithCustomToken + the `codex_dev_custom_token`
 * localStorage hook in main.js. Uses the same gitignored service-account key as the rules deploy.
 *
 *   node scripts/dev-mint-token.mjs [email]
 *
 * Defaults to the first baked admin email. Prints ONLY the token to stdout (no trailing newline) so it
 * can be captured/piped. Dependency-free: a Firebase custom token is an RS256 JWT signed by the service
 * account's private key, and the uid lookup is a REST call — both use Node built-ins, no firebase-admin.
 *
 * The custom token is signed by THIS project's service account, so it cannot be forged without the key —
 * which is why shipping the exchange hook in production is safe. It is short-lived (~1h) and single-use
 * (the app clears the staging key after exchange).
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/firebase-deploy.json';
const email = process.argv[2] || 'bodegigaming@gmail.com';
const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const nowSec = Math.floor(Date.now() / 1000);

const b64url = (input) => Buffer.from(input).toString('base64url');
function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(sa.private_key).toString('base64url')}`;
}

// 1) Service-account OAuth access token (JWT-bearer grant), scoped to Identity Toolkit.
const assertion = signJwt({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
  aud: 'https://oauth2.googleapis.com/token',
  iat: nowSec,
  exp: nowSec + 3600,
});
const tokenJson = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
})).json();
if (!tokenJson.access_token) throw new Error('OAuth token error: ' + JSON.stringify(tokenJson));

// 2) Resolve email -> uid via Identity Toolkit admin lookup.
const lookupJson = await (await fetch(
  `https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:lookup`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  }
)).json();
const uid = lookupJson.users?.[0]?.localId;
if (!uid) throw new Error(`No user found for ${email}: ` + JSON.stringify(lookupJson));

// 3) Mint the Firebase custom token (an RS256 JWT the client exchanges via signInWithCustomToken).
process.stdout.write(
  signJwt({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    uid,
    iat: nowSec,
    exp: nowSec + 3600,
  })
);
