// scripts/lib/tag-taxonomy.mjs
// Pure helpers for the human-maintained tag taxonomy (docs/filter-redesign-spec.md
// D3/D6). No fs beyond loadTaxonomy(). build-filter-index.mjs uses these to:
//   - collapse dirty tag variants onto a canonical tag (aliases)
//   - drop noise tags entirely (drop)
//   - order the tag dictionary group-by-group, then alphabetical (orderTags)
//   - emit the tagGroups array the filter island reads (assignGroups)

import fs from 'node:fs';

export function loadTaxonomy(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Resolve a single raw tag through the alias map (one hop; chains are rejected by validate). */
export function canonicalTag(tag, aliases = {}) {
  return aliases[tag] ?? tag;
}

/**
 * Structural + cross-reference checks. Throws on anything that would corrupt the
 * index; returns a list of non-fatal warnings (vocab drift).
 * @param {object} taxonomy - parsed tag-taxonomy.json
 * @param {string[]} [rawTagList] - every tag string seen in the raw models (for drift warnings)
 */
export function validateTaxonomy(taxonomy, rawTagList = []) {
  const aliases = taxonomy.aliases ?? {};
  const drop = new Set(taxonomy.drop ?? []);
  const groups = taxonomy.groups ?? [];
  const warnings = [];

  for (const [from, to] of Object.entries(aliases)) {
    if (from === to) throw new Error(`tag-taxonomy: alias "${from}" points to itself`);
    if (aliases[to]) throw new Error(`tag-taxonomy: alias chain "${from}" -> "${to}" -> "${aliases[to]}" (targets must be canonical)`);
    if (drop.has(to)) throw new Error(`tag-taxonomy: alias "${from}" targets dropped tag "${to}"`);
  }

  const keys = new Set();
  const seen = new Map(); // tag -> owning group key
  for (const g of groups) {
    if (!g.key || !g.label) throw new Error(`tag-taxonomy: group missing key/label: ${JSON.stringify(g)}`);
    if (g.key === 'other') throw new Error('tag-taxonomy: group key "other" is reserved for Everything Else');
    if (keys.has(g.key)) throw new Error(`tag-taxonomy: duplicate group key "${g.key}"`);
    keys.add(g.key);
    for (const t of g.tags ?? []) {
      if (seen.has(t)) throw new Error(`tag-taxonomy: "${t}" is in both "${seen.get(t)}" and "${g.key}"`);
      seen.set(t, g.key);
      if (aliases[t]) throw new Error(`tag-taxonomy: "${t}" is both a group tag and an alias source`);
      if (drop.has(t)) throw new Error(`tag-taxonomy: "${t}" is both a group tag and dropped`);
    }
  }

  if (rawTagList.length) {
    const canon = new Set(
      rawTagList.map((t) => canonicalTag(t, aliases)).filter((t) => !drop.has(t))
    );
    for (const [t, key] of seen) {
      if (!canon.has(t)) warnings.push(`group "${key}" references "${t}" which no model has`);
    }
    for (const from of Object.keys(aliases)) {
      if (!rawTagList.includes(from)) warnings.push(`alias source "${from}" is not in the vocabulary`);
    }
    for (const t of drop) {
      if (!rawTagList.includes(t)) warnings.push(`dropped tag "${t}" is not in the vocabulary`);
    }
  }
  return warnings;
}

/**
 * Canonicalise + prune raw model tag arrays. Returns new model objects; dedupes
 * tags that collapse onto the same canonical value.
 */
export function applyAliases(rawModels, aliases = {}, drop = []) {
  const dropSet = new Set(drop);
  return rawModels.map((m) => ({
    ...m,
    tags: [...new Set((m.tags ?? []).map((t) => aliases[t] ?? t))].filter((t) => !dropSet.has(t)),
  }));
}

/**
 * Order a set of canonical tags: grouped tags first in config order (group by
 * group, groups in config order), then everything else alphabetical.
 * @param {Set<string>|Iterable<string>} canonicalTags
 */
export function orderTags(canonicalTags, taxonomy) {
  const present = canonicalTags instanceof Set ? canonicalTags : new Set(canonicalTags);
  const ordered = [];
  const placed = new Set();
  for (const g of taxonomy.groups ?? []) {
    for (const t of g.tags ?? []) {
      if (present.has(t) && !placed.has(t)) {
        ordered.push(t);
        placed.add(t);
      }
    }
  }
  const rest = [...present].filter((t) => !placed.has(t)).sort();
  return [...ordered, ...rest];
}

/**
 * Build the tagGroups array for filter-index.json: one entry per config group
 * (tags absent from this snapshot are skipped) plus a trailing computed
 * { key: 'other', label: 'Everything Else' } group for unclaimed tag ids.
 * @param {string[]} orderedTags - the final tag dictionary (from orderTags)
 */
export function assignGroups(orderedTags, taxonomy) {
  const idOf = new Map(orderedTags.map((t, i) => [t, i]));
  const claimed = new Set();
  const out = [];
  for (const g of taxonomy.groups ?? []) {
    const tagIds = [];
    for (const t of g.tags ?? []) {
      const id = idOf.get(t);
      if (id == null) continue;
      tagIds.push(id);
      claimed.add(id);
    }
    out.push({ key: g.key, label: g.label, tagIds });
  }
  const otherIds = orderedTags.map((_, i) => i).filter((i) => !claimed.has(i));
  out.push({ key: 'other', label: 'Everything Else', tagIds: otherIds });
  return out;
}
