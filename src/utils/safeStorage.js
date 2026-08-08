/**
 * Codex — safe localStorage access.
 *
 * `localStorage` access THROWS — not returns null — in Safari private mode, storage-partitioned
 * third-party iframes, and when a user has disabled site data. The app reads it at module-load time
 * (the Firebase override + the current-codex key), so an unguarded throw there aborts boot to a blank
 * page with no error surface. These wrappers swallow the failure:
 * reads return null, writes/removes no-op and report success as a boolean.
 *
 * Even *reading* `globalThis.localStorage` can throw in a locked-down context, so that access lives
 * inside the try too. Pure and Node-testable — Node has no `localStorage`, which exercises the exact
 * "storage unavailable" path these wrappers exist to tolerate.
 */

export function getItem(key) {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key, value) {
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key) {
  try {
    globalThis.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
