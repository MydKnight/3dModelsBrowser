# Tag Taxonomy -- Review Notes

**Status:** Owner-reviewed 2026-09-03. `src/data/tag-taxonomy.json` reflects the
decisions below. Further iteration is a config edit + `node
scripts/build-filter-index.mjs`, no code.
**Source:** the 231 distinct tags in the 3,882-model snapshot.

After aliasing + drop: **205 tags**. Groups: Kind (10), Challenge Rating (30),
Size (7), Gender (2), Creature Type (53), Race (53), Class (36), Format (4),
Everything Else (10: arcane, ashen, battleforged, chubby, gem, metallic,
mounted, society, soulforged, tainted).

## Owner decisions (2026-09-03)

1. **Bare-number tags are CR** -- `1/2`->`cr1/2`, `5`->`cr5`, `7`->`cr7`,
   `17`->`cr17`, `c1`->`cr1` (aliases).
2. **New "Kind" group** -- the model-classification level: `hero`, `npc`,
   `monster`, `building`, `terrain`, `diorama`, `environment`, `scatter`,
   `prop`, `bestiary`.
3. **`bust` stays in Format.**
4. **Monster races** (`goblin`, `kobold`, `orc`, `hobgoblin`, `bugbear`,
   `gnoll`, `ogre`, `troll`) -> Creature Type. Confirmed.
5. **`warforged` -> Race.** **`merrow` -> aliased to `merfolk`** (Race).
6. **Role words -> Class:** `mercenary`, `merchant`, `scholar`, `squire`.
   `hero` and `npc` go to **Kind** (alongside `monster`), not Class.
7. **Creator-specific race names -> Race:** `durk`, `nosmeni` moved in
   (join `selvanei`, `fireborn`, `astral walker`, `mermillian`).
8. **Everything Else** kept small (10 flavor/style tags). If it grows,
   revisit -- a tag that exists has to live somewhere.

## Aliases (variant -> canonical)

Misspellings and equivalents, collapsed onto one tag id at build time:

| Variant | Canonical | Note |
|---|---|---|
| `1/2`, `5`, `7`, `17` | `cr1/2`, `cr5`, `cr7`, `cr17` | bare-number tags are CR (owner) |
| `c1` | `cr1` | |
| artificier | artificer | |
| cthulufolk | cthulhufolk | |
| dreagon | dragon | |
| figher, figter | fighter | |
| knigh | knight | |
| huma, humanioid, humanoi, humnoid, humanoid cr9 | humanoid | |
| mdium, medum | medium | |
| mle, male3 | male | |
| merrow | merfolk | owner: merrow == merfolk |
| sorcorer | sorcerer | |
| gensai | genasi | |
| fire elemi | elemental | assumed "fire elemental" |
| selvaneri | selvanei | both creator-specific; assumed one misspelling |

## Dropped from the UI

- `32mm` -- scale, always 32mm (owner: "shouldnt matter").

## Groups

`src/data/tag-taxonomy.json` is the source of truth for the full per-group
lists. Summary of the level of each bucket:

- **Kind** -- what the model *is* at the top level: hero / npc / monster /
  terrain / building / diorama / prop / environment / scatter / bestiary.
- **Challenge Rating** -- `cr1/8` .. `cr30`, numeric display order.
- **Size** -- tiny .. colossal. `giant` is a Creature Type, not a size.
- **Gender** -- female, male.
- **Creature Type** -- D&D creature types + subtypes (aberration, dragon,
  giant, goblin, undead, ...). Monster-races (goblin/kobold/orc/...) live here.
- **Race** -- playable ancestries + creator-specific race names
  (`durk`, `nosmeni`, `selvanei`, `fireborn`, ...). `warforged` is here.
- **Class** -- classes + role words (`mercenary`, `merchant`, `scholar`,
  `squire`).
- **Format** -- resin, fdm, pre-supported, bust.
- **Everything Else** -- 10 flavor/style tags (arcane, ashen, battleforged,
  chubby, gem, metallic, mounted, society, soulforged, tainted).

## Iterating later

When new tags land (or a bucket feels wrong), edit `src/data/tag-taxonomy.json`
and run `node scripts/build-filter-index.mjs`. The build warns about a group tag
that no model has, and fails on a tag placed in two groups or an alias chain.
Watch that **Everything Else** stays small.
