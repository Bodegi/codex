/**
 * Codex — Entry document size guard (pure).
 *
 * Firestore caps a single document at 1 MiB (1,048,576 bytes), counting field names, values, and
 * per-document overhead. An entry serializes its whole form — a map field with many
 * roads/territories/waypoints, or a very long prose field, can approach that — and a write over the
 * limit fails *inside* the transaction with an opaque error. This pre-flight check catches it first,
 * with a friendly message, before the write path is entered (technical review T8).
 *
 * The measure is an approximation: the UTF-8 byte length of the JSON serialization. It tracks the
 * dominant cost (string/number field values) but not Firestore's exact per-field overhead, so the
 * guard limit sits comfortably below the hard cap — the approximation has margin, and an early clear
 * refusal beats a late cryptic transaction failure. Pure and Node-testable (TextEncoder exists in
 * both Node and the browser); no SDK, no DOM.
 */

/** Firestore's hard per-document limit. */
export const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;

/** Guard limit — below the hard cap to absorb Firestore overhead the JSON estimate doesn't count. */
export const ENTRY_SIZE_LIMIT_BYTES = 1_000_000;

/** Approximate the stored size of an entry payload: UTF-8 byte length of its JSON serialization. */
export function estimateEntryBytes(data) {
  let json;
  try {
    json = JSON.stringify(data ?? null);
  } catch {
    return Infinity; // circular / non-serializable → treat as over-limit (the write would fail anyway)
  }
  return new TextEncoder().encode(json).length;
}

const fmtKB = (bytes) => `${Math.round(bytes / 1000)} KB`;

/**
 * Check an entry payload against the guard limit. Returns `{ ok, bytes, limit }`, plus a
 * human-readable `message` when over — the UI toasts it verbatim.
 */
export function checkEntrySize(data, limit = ENTRY_SIZE_LIMIT_BYTES) {
  const bytes = estimateEntryBytes(data);
  if (bytes <= limit) return { ok: true, bytes, limit };
  return {
    ok: false,
    bytes,
    limit,
    message: `This entry is too large to save (about ${fmtKB(bytes)}, and the limit is ${fmtKB(limit)}). Trim long text fields or remove some map features, then save again.`,
  };
}
