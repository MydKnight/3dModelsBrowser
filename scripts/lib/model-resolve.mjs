// scripts/lib/model-resolve.mjs
// Pure resolution logic for scripts/scan-nas.mjs (docs/nas-scan-spec.md).
// No fs access -- scan-nas.mjs walks the tree and feeds these functions.
// config.orynt3d is the contract; the Orynt3D app DB is never read.

import { createHash } from 'node:crypto';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// Trailing tokens the pipeline / Orynt3D append to leaf folder names.
const SUPPORT_TOKENS = [
  'supports',
  'supported',
  'unsupported',
  'readytoslice',
  'lychee',
  'fdm',
  'presupported',
  'pre-supported',
];
const SCALE_RE = /^\d+(?:\.\d+)?mm$/i;

// Generic container folder names that are never a release.
const CONTAINER_SEGMENTS = new Set([
  'organized',
  'organised',
  'heroes',
  'enemies',
  'npcs',
  'environment',
  'bonus',
  'monsters',
]);

/**
 * Canonical display names for subscriptions. Keys are the lowercased raw values
 * seen in config.orynt3d `{key:"subscription"}` attributes AND (as a convenience)
 * the lowercased canonical names themselves.
 */
export const SUBSCRIPTION_CANON = {
  lootstudios: 'Loot Studios',
  'loot studios': 'Loot Studios',
  rescale: 'Rescale',
  'rescale miniatures': 'Rescale',
  'witchsong miniatures': 'Witchsong Miniatures',
  witchsongminiatures: 'Witchsong Miniatures',
  'dm stash': 'DM Stash',
  dmstash: 'DM Stash',
  archvillaingames: 'Archvillain Games',
  'archvillain games': 'Archvillain Games',
  fleshofgods: 'Flesh of Gods',
  'flesh of gods': 'Flesh of Gods',
  'grinning god': 'Grinning God',
  grinninggod: 'Grinning God',
};

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on',
  'or', 'the', 'to', 'up', 'vs',
]);

function titleCase(s) {
  const words = s.split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function cleanFolderName(folderName) {
  let parts = folderName.split('_').filter((p) => p.trim() !== '');
  // strip trailing support-type and scale tokens (possibly several)
  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    if (SUPPORT_TOKENS.includes(last) || SCALE_RE.test(last)) {
      parts.pop();
    } else {
      break;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{configName?: string|null, folderName: string}} opts
 * @returns {string}
 */
export function resolveName({ configName, folderName }) {
  if (typeof configName === 'string' && configName.trim() !== '') {
    return configName.trim();
  }
  return cleanFolderName(folderName);
}

/**
 * @param {{attrs: {key:string,value:string}[], firstSegment: string}} opts
 *   attrs: every ancestor config's attributes, concatenated nearest-first
 * @returns {{name: string, known: boolean}}
 */
export function resolveSubscription({ attrs, firstSegment }) {
  const fromConfig = attrs.find((a) => a.key === 'subscription');
  const raw = (fromConfig ? fromConfig.value : firstSegment ?? '').trim();
  const canon = SUBSCRIPTION_CANON[raw.toLowerCase()];
  if (canon) return { name: canon, known: true };
  // Not in the table -> a new subscription folder that should be added. Flag it.
  return { name: titleCase(raw), known: false };
}

/**
 * @param {{attrs: {key:string,value:string}[], segments: string[]}} opts
 *   attrs: nearest-first; segments: model relPath split on "/"
 * @returns {string|null}
 */
export function resolveRelease({ attrs, segments }) {
  const fromConfig = attrs.find((a) => a.key === 'release');
  if (fromConfig) {
    const v = fromConfig.value.trim();
    return v === v.toLowerCase() ? titleCase(v) : v;
  }
  // Fallback: the folder directly under the subscription (segments[1]),
  // unless that's a generic container or the model sits right under the sub.
  const candidate = segments[1];
  if (!candidate || CONTAINER_SEGMENTS.has(candidate.toLowerCase())) return null;
  // If segments has only [sub, model], there's no release folder.
  if (segments.length < 3) return null;
  return candidate;
}

/**
 * @param {{tagLists: string[][]}} opts - modelmeta.tags + every scancfg.tags.include
 * @returns {string[]} lowercased, de-duped, sorted
 */
export function resolveTags({ tagLists }) {
  const seen = new Set();
  for (const list of tagLists) {
    for (const tag of list ?? []) {
      const t = String(tag).trim().toLowerCase();
      if (t) seen.add(t);
    }
  }
  return [...seen].sort();
}

function ext(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

const IMAGE_HINT = /preview|hero|render|cover/i;

/**
 * Pick the cover image for a model from the filenames in its folder. Name-based
 * only (no fs.stat) -- keeps the NAS scan fast. Deterministic: within each tier,
 * the alphabetically-first name wins.
 * @param {string[]} filenames
 * @returns {string|null} chosen filename
 */
export function pickSourceImage(filenames) {
  const imgs = filenames.filter((n) => IMAGE_EXTS.has(ext(n))).sort();
  if (imgs.length === 0) return null;
  return (
    imgs.find((n) => IMAGE_HINT.test(n)) ??
    imgs.find((n) => ext(n) === '.png') ??
    imgs[0]
  );
}

/**
 * @param {string} name
 * @param {string} relPath - model dir path relative to the scan root
 * @returns {string} `<slug>-<8 hex>`
 */
export function makeId(name, relPath) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const hash = createHash('md5').update(`${name}|${relPath}`).digest('hex').slice(0, 8);
  return `${slug}-${hash}`;
}
