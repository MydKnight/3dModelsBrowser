// docs/filter-redesign-spec.md D3/D6 -- tag taxonomy helpers.
import { describe, expect, it } from 'vitest';
import {
  applyAliases,
  assignGroups,
  canonicalTag,
  orderTags,
  validateTaxonomy,
} from './tag-taxonomy.mjs';

const taxonomy = {
  aliases: { humanioid: 'humanoid', dreagon: 'dragon', figher: 'fighter' },
  drop: ['32mm'],
  groups: [
    { key: 'cr', label: 'Challenge Rating', tags: ['cr1/2', 'cr1', 'cr5', 'cr9'] },
    { key: 'size', label: 'Size', tags: ['small', 'medium', 'large'] },
    { key: 'type', label: 'Creature Type', tags: ['dragon', 'giant', 'humanoid'] },
    { key: 'class', label: 'Class', tags: ['fighter', 'wizard'] },
  ],
};

describe('canonicalTag', () => {
  it('resolves through the alias map, passes others through', () => {
    expect(canonicalTag('humanioid', taxonomy.aliases)).toBe('humanoid');
    expect(canonicalTag('elf', taxonomy.aliases)).toBe('elf');
  });
});

describe('validateTaxonomy', () => {
  it('accepts a well-formed taxonomy', () => {
    expect(() => validateTaxonomy(taxonomy)).not.toThrow();
  });

  it('throws on a tag in two groups', () => {
    const t = { groups: [
      { key: 'a', label: 'A', tags: ['x'] },
      { key: 'b', label: 'B', tags: ['x'] },
    ] };
    expect(() => validateTaxonomy(t)).toThrow(/both "a" and "b"/);
  });

  it('throws on a duplicate group key', () => {
    const t = { groups: [
      { key: 'a', label: 'A', tags: ['x'] },
      { key: 'a', label: 'A2', tags: ['y'] },
    ] };
    expect(() => validateTaxonomy(t)).toThrow(/duplicate group key/);
  });

  it('throws on the reserved key "other"', () => {
    expect(() => validateTaxonomy({ groups: [{ key: 'other', label: 'X', tags: [] }] })).toThrow(/reserved/);
  });

  it('throws on an alias chain', () => {
    expect(() => validateTaxonomy({ aliases: { a: 'b', b: 'c' } })).toThrow(/alias chain/);
  });

  it('throws when a group tag is also an alias source', () => {
    const t = { aliases: { fighter: 'warrior' }, groups: [{ key: 'c', label: 'C', tags: ['fighter'] }] };
    expect(() => validateTaxonomy(t)).toThrow(/alias source/);
  });

  it('throws when a group tag is also dropped', () => {
    const t = { drop: ['x'], groups: [{ key: 'c', label: 'C', tags: ['x'] }] };
    expect(() => validateTaxonomy(t)).toThrow(/dropped/);
  });

  it('warns (does not throw) on a group tag absent from the vocabulary', () => {
    const warnings = validateTaxonomy(taxonomy, ['dragon', 'fighter', 'humanioid', 'cr5', '32mm']);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/references "giant"/)]));
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/references "cr1\/2"/)]));
  });

  it('warns on an alias source not in the vocabulary', () => {
    const warnings = validateTaxonomy(taxonomy, ['dragon', 'humanioid']);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/alias source "dreagon"/)]));
  });
});

describe('applyAliases', () => {
  it('canonicalises tags, drops noise, dedupes collapsed variants', () => {
    const models = [
      { id: 'a', tags: ['humanioid', 'humanoid', 'dreagon', '32mm'] },
      { id: 'b', tags: ['figher'] },
      { id: 'c' },
    ];
    const out = applyAliases(models, taxonomy.aliases, taxonomy.drop);
    expect(out[0].tags.sort()).toEqual(['dragon', 'humanoid']);
    expect(out[1].tags).toEqual(['fighter']);
    expect(out[2].tags).toEqual([]);
    expect(models[0].tags).toContain('humanioid'); // input not mutated
  });
});

describe('orderTags', () => {
  it('groups first in config order, then the rest alphabetical', () => {
    const present = new Set(['wizard', 'large', 'dragon', 'cr5', 'cr1', 'zebra', 'apple', 'humanoid']);
    expect(orderTags(present, taxonomy)).toEqual([
      'cr1', 'cr5',            // cr group, config order (cr1/2 + cr9 absent)
      'large',                 // size group
      'dragon', 'humanoid',    // type group (giant absent)
      'wizard',                // class group (fighter absent)
      'apple', 'zebra',        // everything else, alphabetical
    ]);
  });
});

describe('assignGroups', () => {
  it('emits one entry per config group plus a computed other group', () => {
    const ordered = ['cr1', 'cr5', 'large', 'dragon', 'humanoid', 'wizard', 'apple', 'zebra'];
    const groups = assignGroups(ordered, taxonomy);
    expect(groups.map((g) => g.key)).toEqual(['cr', 'size', 'type', 'class', 'other']);
    expect(groups[0]).toEqual({ key: 'cr', label: 'Challenge Rating', tagIds: [0, 1] });
    expect(groups[2]).toEqual({ key: 'type', label: 'Creature Type', tagIds: [3, 4] });
    expect(groups.at(-1)).toEqual({ key: 'other', label: 'Everything Else', tagIds: [6, 7] });
  });

  it('every tag id lands in exactly one group', () => {
    const ordered = ['cr1', 'cr5', 'large', 'dragon', 'humanoid', 'wizard', 'apple', 'zebra'];
    const groups = assignGroups(ordered, taxonomy);
    const all = groups.flatMap((g) => g.tagIds).sort((a, b) => a - b);
    expect(all).toEqual(ordered.map((_, i) => i));
  });
});
