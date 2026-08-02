/**
 * Codex — Image Pool
 *
 * Single source of truth for the build-time image pool. Every image dropped into
 * src/assets/pool/ is auto-discovered by Vite at build time — no manifest to
 * maintain. Add an image + rebuild and it appears in the pool.
 *
 * Entries store the stable `id` (original filename), never the hashed build URL,
 * which changes every build. Resolve id -> current URL at render time.
 */

// Auto-discovered image URLs, keyed by their source path.
const modules = import.meta.glob(
  '../assets/pool/*.{png,jpg,jpeg,webp,gif,PNG,JPG,JPEG,WEBP,GIF}',
  { eager: true, query: '?url', import: 'default' }
);

// Optional label overrides: { "<filename>": "<label>" }. Absent file -> {}.
const labelModules = import.meta.glob('../assets/pool/labels.json', {
  eager: true,
  import: 'default',
});
const labelOverrides = Object.values(labelModules)[0] || {};

const basename = (path) => path.split('/').pop();

// "dwarven-hall.png" -> "Dwarven Hall"
function prettifyLabel(id) {
  return id
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const images = Object.entries(modules)
  .map(([path, url]) => {
    const id = basename(path);
    return { id, url, label: labelOverrides[id] || prettifyLabel(id) };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

const urlById = new Map(images.map((img) => [img.id, img.url]));

/** All pool images: [{ id, label, url }], sorted by label. */
export function listImages() {
  return images.slice();
}

/** Current build URL for a stored id, or null if it is no longer in the pool. */
export function resolve(id) {
  return urlById.get(id) || null;
}

/** Whether the pool has any images. */
export function hasImages() {
  return images.length > 0;
}
