# Filter Redesign -- Design Spec

**Status:** Implemented -- shipped to `main` 2026-09-03 (squash `1e3fec5`,
Netlify auto-deploy). Taxonomy owner-reviewed 2026-09-03 (`docs/tag-taxonomy-draft.md`).
Refining group membership later is a config edit + `node
scripts/build-filter-index.mjs`, no code change. Phase 2 stub below.
**Target:** v2.1
**Date:** 2026-09-03

## Build status (2026-09-03)

All build-order steps 2-8 done test-first and verified live against the real
3,882-model snapshot (164 tests; `astro build` = 3,883 pages; drawer
open/close/Esc/backdrop, OR-within / AND-across, chip removal, `humanioid` merged
into `humanoid`, `giant` under Creature Type, legacy `?tagmode=or` ignored --
all confirmed in-browser, no hydration errors). Taxonomy: 231 -> 205 tags after
aliasing/drop; groups Kind (10) / CR (30) / Size (7) / Gender (2) / Creature
Type (53) / Race (53) / Class (36) / Format (4) / Everything Else (10).

## Problem

v2.0's filter panel is a docked 280px sidebar that renders every facet inline:
8 subscription checkboxes, 175 release checkboxes, and a 231-button tag cloud
with a global AND/OR toggle. On the real 3,882-model snapshot this is "miles of
checkboxes" -- unusable on mobile, noisy on desktop. The tag vocabulary is also
dirty: misspelling duplicates (`humanioid`/`humanoi`/`humnoid`/`huma` ->
`humanoid`, `dreagon` -> `dragon`, `figher`/`figter` -> `fighter`) show the same
concept several times, and the flat cloud mixes CR ratings, sizes, classes,
races, and creature types with no structure.

## Design decisions

### D1 -- Slide-in overlay drawer

- All faceted filters (subscription, release, tag groups) move into a drawer
  that is **hidden by default** and opens from a **Filters** button on the
  gallery top bar.
- The drawer is an **overlay** on every viewport size:
  - **Mobile** (`<= 700px`): full width, fully offscreen when closed.
  - **Desktop**: right-side overlay, `width: min(380px, 90vw)`, over a
    semi-transparent backdrop.
- Closed by: backdrop click, an X in the drawer header, or `Esc`.
- Focus moves into the panel on open and is trapped; body scroll is locked;
  focus returns to the Filters button on close. `role="dialog"`,
  `aria-modal="true"`, `aria-label="Filters"`.
- v2.1 ships a plain show/hide (`hidden` attribute) -- correct a11y, no slide
  animation. The `transform: translateX(100%)` -> `0` transition is in the
  Phase 2 stub (needs the panel to stay in the a11y tree while animating out).
- Not a persistent sidebar, not push-aside. Rejected: keeping a desktop sidebar
  (the whole point is to reclaim the horizontal space and unify the two
  layouts).

### D2 -- Gallery top bar (always visible)

- **Search** input (the one filter used constantly -- stays out of the drawer).
- **Sort** select (`Newest | Name | Release` -- not a filter, stays visible).
- **Filters** button with an active-facet count badge -> opens the drawer.
- **Active-filter chip bar** directly below: one pill per active filter
  (`Race: Elf x`, `CR 5 x`, `Loot Studios x`, search `"drow" x`). Clicking a
  pill's x removes exactly that filter immediately (updates grid + URL). A
  trailing **Clear all** pill appears when anything is filtered; it resets all
  facets and the search but keeps the sort.

### D3 -- Tag taxonomy (human-maintained)

The 231-tag vocabulary is bucketed into labelled dropdown groups by a
**checked-in config a human edits** -- no programmatic fuzzy matching. New tags
that aren't in the config fall into **Everything Else** until a later config
tweak moves them.

**`src/data/tag-taxonomy.json`** (NEW, committed, hand-maintained):

```jsonc
{
  "aliases": {
    "humanioid": "humanoid", "dreagon": "dragon", "figher": "fighter"
    // dirty-variant -> canonical; applied at build time, before the tag dict is built
  },
  "drop": ["32mm"], // remove a tag from the UI entirely (scale -- always 32mm)
  "groups": [
    { "key": "kind",   "label": "Kind",             "tags": ["hero", "npc", "monster", "terrain", "..."] },
    { "key": "cr",     "label": "Challenge Rating", "tags": ["cr1/8", "cr1/4", "..."] },
    { "key": "size",   "label": "Size",             "tags": ["tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"] },
    { "key": "gender", "label": "Gender",           "tags": ["female", "male"] },
    { "key": "type",   "label": "Creature Type",    "tags": ["aberration", "dragon", "giant", "..."] },
    { "key": "race",   "label": "Race",             "tags": ["elf", "dwarf", "warforged", "..."] },
    { "key": "class",  "label": "Class",            "tags": ["fighter", "wizard", "mercenary", "..."] },
    { "key": "format", "label": "Format",           "tags": ["resin", "fdm", "pre-supported", "bust"] }
  ]
}
```

Groups (owner-reviewed 2026-09-03 -- see `docs/tag-taxonomy-draft.md`):
**Kind** (model classification: hero / npc / monster / terrain / building /
diorama / prop / environment / scatter / bestiary), **Challenge Rating**,
**Size**, **Gender**, **Creature Type** (D&D types + monster-races
goblin/kobold/orc/...), **Race** (ancestries + creator race names + warforged),
**Class** (classes + role words mercenary/merchant/scholar/squire), **Format**.

Rules:
- **Order within `tags` is display order** in the dropdown (so CR sorts
  numerically, not alphabetically). The builder preserves config order for
  grouped tags; Everything Else stays alphabetical.
- **Everything Else** is not declared -- it is computed at build time as every
  canonical tag id not claimed by a named group (`key: "other"`,
  `label: "Everything Else"`).
- **Giant is a Creature Type, not a Size.**
- **Scale (`32mm`) is dropped** -- always 32mm, no filter value.
- Build failures: an alias whose target doesn't exist; a tag listed in two
  groups; a duplicate group key.
- A group tag that no longer exists in the vocabulary is a **warning**, not a
  failure (the vocab drifts between snapshots).

Iteration on group membership is a config edit + `node
scripts/build-filter-index.mjs` -- no code change. `docs/tag-taxonomy-draft.md`
records the alias table and the owner decisions.

### D4 -- Filter semantics: OR within a dropdown, AND across dropdowns

This replaces the global tag AND/OR toggle.

- Within one dropdown (e.g. Race), selecting Elf + Drow returns the **union**.
- Across dropdowns (Race AND CR AND Subscription AND Release), results are the
  **intersection**.
- Subscription and Release already behaved this way in v2.0; tag groups now
  match. The `tagMode` field and `?tagmode=` URL param are **removed**.
- `?tags=elf,cr5` in a URL is a flat value list unchanged -- grouping is derived
  from the taxonomy at load, so shared v2.0 links keep working (an old
  `&tagmode=or` is ignored without error).

### D5 -- Drawer section layout

Top to bottom inside the drawer:

1. **Subscription** -- 8 values, plain checkboxes (small enough, no collapse).
2. **Release** -- 175 values: a collapsible group with a text-filter box above a
   scrollable checkbox list.
3. **One collapsible group per `tagGroups` entry** (Kind, CR, Size, Gender,
   Creature Type, Race, Class, Format, Everything Else) -- collapsed by default,
   header shows the label + selected count, body is the tag list as checkboxes
   with live facet counts; a zero-count value is dimmed + disabled (not hidden).
4. Footer: **Clear all** + **Show N models** (closes the drawer).

Collapse uses native `<details>`/`<summary>` (keyboard-accessible, no JS
accordion). The reusable `<GroupDropdown>` component replaces `FacetGroup`; it
takes an optional text filter for large lists (Release, big tag groups).

### D6 -- Data contract additions

`build-filter-index.mjs`:
- loads + validates the taxonomy, applies `aliases` to raw model tags and
  removes `drop` tags **before** building the tag dictionary (so aliased models
  merge onto one tag id);
- orders the `tags` dictionary as: grouped tags in config order (group by group,
  groups in config order), then Everything Else alphabetical;
- emits `tagGroups` into `filter-index.json`:
  ```jsonc
  "tagGroups": [
    { "key": "cr", "label": "Challenge Rating", "tagIds": [0, 1, 2, "..."] },
    // ...
    { "key": "other", "label": "Everything Else", "tagIds": ["..."] }
  ]
  ```
- `filter-index.example.json` is hand-updated to show `tagGroups` and an
  aliased-merge case.

`scripts/lib/tag-taxonomy.mjs` (NEW, pure, unit-tested):
- `loadTaxonomy(path)` -> parsed object
- `validateTaxonomy(taxonomy, rawTagList)` -> throws / warns per D3
- `applyAliases(rawModels, aliases)` -> models with canonicalised tag strings
- `assignGroups(canonicalTags, taxonomy)` -> ordered
  `[{ key, label, tagIds }]` including the computed `other` group

### D7 -- Engine changes (`src/lib/filter-engine.ts`)

- `FilterIndex` gains `tagGroups: TagGroup[]`
  (`{ key: string; label: string; tagIds: number[] }`).
- `FilterState` **loses `tagMode`**; `tags: number[]` (flat selected ids) stays.
- Constructor builds `groupIdOf: Int32Array(tags.length)` from `index.tagGroups`
  (every tag has a group -- `other` is explicit).
- `compute(state)`: partition `state.tags` by group; per group with a selection
  compute the union bitset; AND every such group union into the result (plus
  subs union, rels union, name mask -- unchanged). Precompute, per group,
  `baseNo[g]` = intersect-everything-except-group-g, for facet math.
- `facetCounts`: for tag `t` in group `g` -- selected -> current size; else if
  `g` has other selections -> `popcount(baseNo[g] & (union[g] | bit_t))`; else
  -> `popcount(result & bit_t)`. This is the existing subs/rels `groupCount`
  helper generalised to tag groups; the dedicated OR-mode tag branch is deleted.
- `filter()` unchanged apart from reading the new `result`.

### D8 -- State / URL / chips

- `url-state.ts`: drop `tagmode` read + write. No other format change.
- `use-gallery.ts`: drop `setTagMode`; add an `activeChips` computed --
  ordered `{ kind: 'search'|'sub'|'rel'|'tag'; label; remove(): void }[]` for
  the chip bar (each `remove()` calls the existing `toggleTag/Sub/Rel` or
  `setQuery('')`). Keeps chip construction out of the component.

## Out of scope

- Gallery card / visual polish (see Phase 2 stub below).
- Two-level tag grouping `(a+b)|(c+a)` -- still deferred (astro-rewrite-spec O2).
- Cleaning the tag vocabulary at source (Orynt3D) -- the alias map is a
  documented stopgap; a tracked task to clean source and retire aliases.

## Phase 2 stub -- gallery visual pass (separate feature)

Not this spec. Candidate scope for a follow-up `docs/gallery-polish-spec.md`:
card hover/focus states, typographic scale, spacing rhythm, the placeholder-tile
treatment, detail-page CLS (astro-rewrite-spec Phase 2 #4), empty-state and
loading polish, drawer slide animation, dark-mode token pass.

**Deep-link first paint (code review, 2026-09-03):** `index.astro` passes no
`initialSearch`, so a shared filtered URL (`/?subs=Rescale&...`) SSRs + first
client-renders the *unfiltered* gallery, then `GalleryIsland`'s post-hydration
effect calls `gallery.hydrate(location.search)` and the grid collapses a frame
later. This is the SSR-safe trade (the alternative reintroduced hydration-
mismatch warnings from the state-dependent badge/chip nodes) and is close to
v2.0's existing deep-link behaviour, but the settle frame + the scroll-restore
effect running against the pre-hydrate result height (overlaps astro-rewrite
Phase 2 #5) should be cleaned up together -- e.g. inline the query state into
the island's SSR via an Astro prop, or gate the unstable nodes so hydrate can
run at creation time.

## Build order (test-first; TDD is standing for `src/lib/**` + `build-filter-index`)

1. This spec. -- **done 2026-09-03**
2. `scripts/lib/tag-taxonomy.mjs` + tests; seed `src/data/tag-taxonomy.json`. -- **done**
3. `build-filter-index.mjs`: alias/drop merge + group-ordered dict + `tagGroups`
   emission, test-first; regenerate `filter-index.json` + example. -- **done**
4. `filter-engine.ts`: `tagGroups`, drop `tagMode`, per-group semantics, facet
   math -- test-first; fuzz reference extended. -- **done**
5. `url-state.ts` + `use-gallery.ts` (`activeChips`, `hydrate`, no `setTagMode`). -- **done**
6. `GalleryIsland.tsx`: chip bar + Filters button + `<FilterDrawer>` +
   `<GroupDropdown>`; `FacetGroup` / tag cloud / mode toggle deleted. -- **done**
7. `src/pages/index.astro` style rewrite. -- **done**
8. Docs (this file, astro-rewrite-spec O2, CLAUDE.md, README, REPO_AUDIT.md);
   owner taxonomy review. -- **done 2026-09-03**
9. `/code-review` (3 minor findings fixed), squash, merge to `main`, delete
   branch. -- **done 2026-09-03 (`1e3fec5`)**

## Verification

- `npm test` green; new group-semantics fuzz test passes 200 random states vs
  the naive reference; no `tagMode` references remain (grep).
- `npm run build` -> 3,883 pages, no NAS.
- `npm run dev` + `verify` on the real snapshot: drawer open/close (backdrop / X
  / Esc), focus trap + scroll lock, fullscreen at 375px vs ~380px overlay on
  desktop; `Race: Elf` + `Race: Drow` unions, `+ CR 5` intersects, facet counts
  live and correct; `humanioid` gone (merged into `humanoid`); `Giant` under
  Creature Type; chip x removes one filter; `Clear all` keeps sort; reload
  `?tags=elf,cr5&subs=Loot+Studios` rehydrates into the right groups;
  `?tagmode=or` ignored; grid windowing + scroll-restore on Back still work.
- `filter-engine.perf.test.ts` -- facet cycle stays well under the mobile-jank
  threshold.

## Resolved questions (2026-09-03)

| # | Question | Resolution |
|---|---|---|
| Q1 | Alias map + per-group assignment | Owner-reviewed; see `docs/tag-taxonomy-draft.md`. |
| Q2 | Bare-number tags (`1/2`, `5`, `7`, `17`, `c1`) | Aliased into CR (`5`->`cr5`, `c1`->`cr1`, `1/2`->`cr1/2`). |
| Q3 | Object/scenery tags | New **Kind** group (hero / npc / monster / terrain / building / diorama / prop / environment / scatter / bestiary); `bust` stays in Format. |
