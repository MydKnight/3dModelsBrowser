# Astro Rewrite -- Design Spec

**Status:** Locked -- **v2.0 built & verified, awaiting `/code-review` + merge**
**Target:** v2.0
**Date:** 2026-09-01 (O1-O6 resolved); built through 2026-09-02

**2026-09-02:** Steps 1-7 done (138 tests). The data pipeline was too slow/flaky
over SMB-over-VPN, so it was moved into a QNAP container
(`docs/nas-container-spec.md`) -- which ran end-to-end on the NAS, produced the
real **3,882-model snapshot**, and pushed it. `feat/nas-data-container`
fast-forward-merged back; `feat/astro-rewrite` @ `16b9acf` now has everything.
`astro build` = 3,883 pages, `index.html` 154 KB gzip; local preview fully
functional. **Remaining:** `/code-review` -> merge to `main` -> repoint Netlify.

**Amendment (build-order step 1, 2026-09-01):** `package.json` now has
`"type": "module"` so new `.mjs`/`.ts` files (e.g. `build-filter-index.mjs`,
`filter-engine.ts`) are ESM by default. The pre-existing CommonJS scripts
(`extract-model-data.js`, `build-nextjs-app.js`, `deploy.js`) broke under that
setting (`require is not defined in ES module scope`) and were renamed to
`.cjs` to fix it -- content unchanged otherwise.

**Amendment (build-order step 2, 2026-09-01):** `extract-model-data.cjs` proved
broken against the current Orynt3D output (drops whole subscriptions) and is
being replaced, not extended. Build-order step 2 is now governed by
**`docs/nas-scan-spec.md`** (Locked): `scripts/scan-nas.mjs` +
`scripts/lib/model-resolve.mjs`, writing `data/raw/models.json`. Sections D6a,
D7, Testing and the step-2 build-order entry below are updated accordingly.

## Problem

The current app is a Next.js 15 static export (`output: 'export'`) with a single
`pages/index.js` that:

- loads the **entire** model dataset (every field, full `sourcePath`, `notes`,
  `attributes`, `dateAdded`) into the browser as one base64 blob injected through
  a `STATIC_DATA_PLACEHOLDER` env var that `build-nextjs-app.cjs` string-replaces
  into `next.config.js`,
- renders **every** model card and `<img>` at once (no pagination, no
  virtualization),
- recomputes the filtered list in a `useEffect` over the full array on every
  filter change, and rebuilds the full available-filter option lists from
  scratch in `processModelData`.

At the committed snapshot (944 models) this is tolerable. The real collection is
**~4,000 models today, growing ~100/month**. Two things break at that scale:

1. **The unvirtualized grid** -- 4k card nodes each with an `<img>` is the
   headline mobile complaint. This is the primary thing the rewrite must fix.
2. **The filter payload** -- shipping full metadata for 4k models is a large,
   ever-growing JSON download and parse cost on mobile, most of which the browse
   view never reads.

Secondary: the `STATIC_DATA_PLACEHOLDER` env-var embed is a hack, and the build
can only run where the NAS is reachable, which is why Netlify CI has been a
standing revival blocker.

**This spec's center of gravity is the filtering/tagging architecture** -- how
the search/filter island stays responsive against 4k+ models on a mobile CPU,
both for computing result sets and for keeping per-facet tag counts live. Build
time and bundle size are explicitly *not* the concern.

## Scale facts (from the committed snapshot, `public/orynt3d-data.json`)

| Metric | Snapshot | Projected (target design point) |
|---|---|---|
| Models | 944 | ~5,000 |
| Unique tags | 127 | ~250 |
| Subscriptions | 3 | ~6 |
| Releases | 35 | ~80 |
| Avg tags/model | ~5 | ~8 |
| Raw JSON size | 911 KB | ~5 MB (unacceptable to ship whole) |

## Design decisions

Locked decisions carried in from the 2026-09-01 portfolio-level discussion are
marked **[portfolio]**. Everything else is this session's proposal and open to
revision while Status is Draft.

### D1 -- Framework: Astro, filter UI as one island **[portfolio]**

- Astro static site. Everything except the browse/filter view is static HTML
  (header, footer, about, per-model detail pages).
- The search/filter/grid view is a **single island**, `client:load`.
- Island framework: **Preact + `@preact/signals`**. Rationale: React-shaped API
  (low friction porting `index.js` logic), tiny runtime, signals give
  fine-grained updates so a tag toggle does not re-run the whole component. Solid
  was considered and rejected only on familiarity; revisit if profiling shows
  Preact reconciliation is the bottleneck (it should not be at this DOM size once
  the grid is windowed).

### D2 -- Two-tier data: lean filter index vs. full detail **[portfolio: payload split]**

Split the one blob into:

**`src/data/filter-index.json`** -- the only model data the island loads. One
record per model, **only filterable/renderable-in-grid fields**:

```jsonc
{
  "tags":  ["aberration", "aquatic", "boss", /* ... global dictionary, sorted */],
  "subs":  ["lootstudios", "rescale miniatures", "witchsong miniatures"],
  "rels":  ["a light in the shadow", "cliffside orcs", /* ... */],
  "models": [
    // positional array, index = model's ordinal
    {
      "id":    "boar---mounted-boss-f3c95a53",
      "n":     "Boar - Mounted Boss",       // name (card label)
      "nl":    "boar - mounted boss",        // name lowercased (search + Name sort)
      "t":     [12, 44, 87],                 // tag ids into `tags`
      "s":     1,                            // subscription id into `subs`
      "r":     7,                            // release id into `rels` (also = Release sort key)
      "th":    "boar---mounted-boss-f3c95a53.webp"  // thumbnail filename
      // array order is newest-first; ordinal 0 = most recently added
    }
  ]
}
```

Dictionary-encoding tags/subs/releases as integer ids is the main size lever:
repeated strings (`"rescale miniatures"` x hundreds) collapse to one byte-ish
int.

`filter-index.json` is imported by `index.astro` and passed to the island as a
`client:load` prop (serialized into the page HTML for hydration) -- not fetched.
Simpler (no loading state, no request waterfall) and the numbers hold:
**measured at 944 models, `filter-index.json` is 132 KB and the whole
`index.html` gzips to 42 KB**; island JS (Preact + signals + component) is
~12 KB gzip. Projecting to 5k models: ~200 KB gzip for the page. If that ever
becomes a problem, switch the island to `fetch('/data/filter-index.json')` --
`build-filter-index.mjs` would just write to `public/data/` instead.

**Everything else** (`subscription`, `release`, full tag list, `relPath`,
`dateAdded`, full-size image) -- **not in the island payload**. It lives in a
single build-time file `src/data/details.json` (`{ id: {...meta} }`), which the
static detail pages inline per-id (D3, O6). The browser never fetches it.

### D3 -- Per-model detail pages replace the modal + `?modelId=` hack

- Astro generates a static route `/m/[id]` for every model via
  `getStaticPaths()`, which imports `src/data/details.json` once (O6 resolved
  2026-09-01: one bundled file, not per-id files or a content collection) and
  inlines each model's slice into that page's HTML.
- Deep links become real URLs (`/m/boar---mounted-boss-f3c95a53`) instead of
  `?modelId=`. The current "copy link" feature points at these.
- 4k tiny HTML pages is a cheap Astro build (no per-page JS, no image processing).
- **O1 resolved (2026-09-01):** no modal. Tapping a card is an Astro client-router
  navigation (`<ClientRouter />` + View Transitions) to the static `/m/[id]`
  page. The gallery island is marked `transition:persist` so returning via Back
  keeps it alive with filter state and scroll intact -- no re-fetch, no bitset
  rebuild, no flash. Detail content is rendered in exactly one place (the static
  page). Arrow-key prev/next moves between `/m/[id]` pages (the island exposes the
  current ordered result list to the detail page via a small shared store, or the
  detail page reads neighbors from the URL's filter params). No-JS falls back to
  plain navigation automatically.
  - Risk to watch during build: `transition:persist` reliability on mobile
    Safari; if it regresses, degrade to Option B (plain nav) rather than adding a
    modal.

### D4 -- Filter engine: bitsets + popcount

This is the core of the spec. The island builds, once at startup from
`filter-index.json`, an in-memory index:

- **`N`** = model count. **`W`** = `Math.ceil(N / 32)`.
- For each tag `t`: a `Uint32Array(W)` bitset, bit `i` set iff model `i` has `t`.
  Built in one pass over `models[i].t`.
- Same for each subscription and each release (or keep those as a small
  `Uint16Array` of ids + filter linearly -- only 6/80 values, either is fine;
  bitsets chosen for uniformity).
- A `nameLower: string[]` parallel array for substring search.

**Applying filters** (on any selection change):

1. Start with the "all" bitset (or the subscription/release constraint bitset).
2. Tag semantics = **AND or OR**, user-selectable via a toggle at the top of the
   tag panel (**O2 resolved 2026-09-01**). AND: `result &= tagBitset[t]` for each
   selected tag (default, matches current behavior). OR: start from an empty
   bitset, `orAcc |= tagBitset[t]` for each selected tag, then AND `orAcc` into
   the result. Default mode is AND. Mode is part of URL state (`&tagmode=or`).
   Two-level grouping `(a+b)|(c+a)` was considered and rejected for v2.0 (mobile
   UI cost, facet-count ambiguity); the engine can support it later without
   rework.
3. Subscriptions/releases = **OR within group, AND across groups** (union of
   selected subs, intersected with the tag result), matching current behavior.
4. Name search: if a query is present, AND with a freshly computed match bitset
   (`nameLower[i].includes(q)` over N -- ~4k string ops, sub-millisecond,
   debounced 120 ms anyway).

Combining 4-10 bitsets of ~160 `Uint32` words each is a few thousand int ops --
low microseconds. This is what makes it hold at 4k and well beyond.

**Live facet counts** (the part naive implementations get wrong): for every
tag/sub/release shown in the panel, display how many models the result would
contain if that value were also selected. **Real-data note (2026-09-02):** the
first full snapshot has 231 tags + 8 subs + **175 releases** = ~414 facet values.
Re-running the full filter per value (with its O(N) name-search scan inside) was
33 ms/cycle at 3,882 models -- mobile jank. Replaced with the popcount fast path:
`compute(state)` builds the per-group masks + the result + "result minus each one
group's constraint" *once*, then each facet count is a couple of bitset ANDs +
one SWAR popcount over ~120 `Uint32` words. **~0.3 ms/cycle** (filter + all 414
facets) at ~4k models -- ~120x faster. The fuzz test (vs a naive `.filter()`
reference over 200 random states) guards correctness.

- Tags with a resulting count of 0 are dimmed/disabled, not hidden (avoids the
  panel reflowing out from under the user's tap).
- Counts for already-selected tags show the current result size.
- In OR mode the count next to an unselected tag means "models *added* to the
  result if you also select this" = `popcount(tagBitset[t] AND NOT resultBitset)`;
  in AND mode it means "models *remaining* if you also select this" =
  `popcount(resultBitset AND tagBitset[t])`. The toggle swaps which is shown.

**Result ordering (O3 resolved 2026-09-01):** default sort is **newest first**.
The bitset yields ascending model-ordinal order, so the index builder (D6)
assigns **ordinal 0 = newest** -- i.e. models are sorted by recency descending
before ordinals are assigned. A **sort control** in the island offers
`Newest | Name (A-Z) | Release`; non-default sorts iterate the result bitset and
sort the small result slice by the relevant key (name string, or release ordinal)
before windowing -- cheap because only the current result set is sorted, not all
5k. Each model record therefore also carries `nl` (name lowercased, already
needed for search) and its release ordinal `r` (already present).

**Recency signal:** `dateAdded` as currently produced is worthless (see D6). The
extract step is extended to (a) read `fs.statSync(modelDir).birthtimeMs` (falling
back to `mtimeMs`) as a retroactive "when it hit the NAS" proxy, stored as
`addedTs`, and (b) preserve a per-id `firstSeenTs` across runs so future adds get
an accurate first-seen date. `build-filter-index.mjs` sorts by
`firstSeenTs ?? addedTs` descending. The island does not receive the raw
timestamp (not needed once ordinals encode the order); the detail page shows a
human date from the full metadata.

### D5 -- Grid rendering: windowed, never 4k nodes at once **[portfolio]**

**O4 resolved (2026-09-01): true virtualization.** The filter engine (D4) always
runs over all N models; virtualization is purely a rendering-layer concern for
the *result list*, whatever its size. It only matters when the result list is
large (few/no filters, or the initial newest-first browse of all N) -- a search
like "dragon" narrowing to ~87 renders fine either way.

- Row windowing is **hand-rolled over `src/lib/grid-layout.ts`** (unit-tested:
  `columnsForWidth`, `rowCount`, `itemRange`, `contentHeight`, `clampScrollTop`),
  not `@tanstack/virtual` -- uniform-height rows make it a scroll listener + a
  computed visible-row range, and wiring `virtual-core` to Preact added
  complexity without benefit. `@tanstack/virtual-core` stays a dependency in
  case dynamic row heights are ever needed.
- Cards are **uniform height** -> fixed-size *row* virtualization. A
  `ResizeObserver` on the scroll container feeds `columnsForWidth`.
- Render visible rows + ~3 rows overscan, absolutely positioned inside a
  `contentHeight`-tall canvas. DOM card count stays bounded regardless of
  result-list size.
- `scrollTop` saved to `sessionStorage` on scroll, restored (via
  `clampScrollTop`) on mount -- survives a detail-page round trip.
- No pagination, no "load more".
- Thumbnails: `loading="lazy"`, explicit `width`/`height` (no CLS),
  `decoding="async"`.
- Grid is `grid-template-columns: repeat(auto-fill, minmax(...))`.
- Integration risk for build-order step 6: scroll-position restoration when
  returning to the `transition:persist`ed island via Back. Save/restore
  `scrollTop` explicitly in the island; do not rely on the browser.

### D6a -- Recency signal (O3)

The old `extract-model-data.cjs` wrote `dateAdded: new Date().toISOString()` on
every model every scan, so there was no usable recency signal. Fix (built in
`scripts/lib/recency.cjs`, unit-tested):

- `addedTs` = `fs.statSync(modelDir).birthtimeMs` (falls back to `mtimeMs`, then
  `now`) -- a retroactive "when it hit the NAS" proxy, recomputed every run.
- `firstSeenTs` = stamped `Date.now()` the first time a model id is seen,
  preserved unchanged on every later run.
- `build-filter-index.mjs` sorts by `firstSeenTs ?? addedTs` descending.

**This now lives in the new scanner, not the old script.** Verifying step 2
against the live NAS showed `extract-model-data.cjs` is broken against the
current Orynt3D output (drops whole subscriptions). It is being **replaced** by
`scripts/scan-nas.mjs` -- see **`docs/nas-scan-spec.md`** (Locked), which
supersedes this section's "extract step" and the build-order step 2 below.
`recency.cjs` is unchanged and reused by the new scanner.

### D6 -- Images: two committed WebP sizes, generated locally **[portfolio + O5]**

Current state: `public/images/` is 588 MB / 1599 full-size PNGs (median 219 KB,
max 6.3 MB), served **directly as grid thumbnails** -- a major mobile cost, and
the PNGs are *tracked* despite being `.gitignore`d (tracked wins).

**O5 resolved (2026-09-01):**

- `scripts/make-thumbnails.mjs` (local, NAS reachable) uses `sharp` to emit
  **two** WebP renditions per model:
  - `public/thumbnails/<id>.webp` -- ~400px longest edge, quality ~78 (grid)
  - `public/detail/<id>.webp` -- ~900px longest edge, quality ~80 (detail page)
- Both are **committed**. Estimated ~500 MB total for ~4k models -- comparable to
  today's 588 MB but for 2.5x the models and far better UX.
- Original PNGs: **NAS only**. `git rm --cached -r public/images` in the rewrite
  (build-order step 7); history bloat is left alone (no filter-repo) unless it
  becomes painful -- roadmap item.
- This does **not** contradict "skip `astro:assets`": that decision is about not
  reprocessing during `astro build` on Netlify. Generation is a one-time local
  preprocessing step. Astro references both sizes by plain `<img src>`; no
  `astro:assets`, no build-time `sharp`.
- Roadmap (not v2.0): if repo size becomes painful, move `public/detail/` to an
  external static bucket (R2/Netlify) pushed by the local build.

### D7 -- Build pipeline / Netlify CI **[portfolio: unblock as part of rewrite]**

```
NAS (\\...\3D Files)
  -> scripts/scan-nas.mjs                  (NEW -- replaces extract-model-data.cjs;
                                            see docs/nas-scan-spec.md)
       writes  data/raw/models.json         (gitignored working file)
  -> scripts/make-thumbnails.mjs            (reads data/raw/models.json + NAS images)
       writes public/thumbnails/<id>.webp   ~400px                 (COMMITTED)
              public/detail/<id>.webp       ~900px                 (COMMITTED)
  -> scripts/build-filter-index.mjs         (step 3 -- no NAS)
       reads  data/raw/models.json
       writes src/data/filter-index.json           (COMMITTED snapshot)
              src/data/details.json        full per-model metadata (COMMITTED)
  -> astro build                           (reads committed files only; no NAS)
```

- `npm run data` = scan-nas + make-thumbnails + build-filter-index. Run locally
  when the collection changes; **commit the outputs**. This is the snapshot.
- `npm run build` = `astro build` only. Reachable from Netlify with zero NAS
  access. Kills the standing CI blocker.
- Netlify: branch deploy for `feat/astro-rewrite` (preview URL), production site
  stays on the old build until merge.
- `.gitignore`: the committed snapshot files (`src/data/*.json`,
  `public/thumbnails/`, `public/detail/`) must NOT be ignored; keep ignoring
  `data/raw/` and `node_modules`.

### D8 -- URL / shareable state

- Filter state serialized to the query string:
  `?q=drow&tags=elf,mage&sub=lootstudios&rel=...`. Island reads it on load,
  writes it on change (`history.replaceState`, debounced).
- `/m/[id]` is the canonical per-model URL.
- Both are plain static routes -- no server.

## Data contract

`build-filter-index.mjs` reads `data/raw/models.json` (from `scan-nas.mjs`,
whose per-model shape is `{ id, name, subscription, release, tags, relPath,
sourceImage, addedTs, firstSeenTs }`) and is the single source of the client
contract. It must:

- sort models by `firstSeenTs ?? addedTs` **descending** and assign ordinals in
  that order (ordinal 0 = newest); a snapshot's ordinals are fixed for that
  snapshot (a data refresh reassigns them, which is fine -- URL filter state is
  by tag/sub/release value, not ordinal);
- carry `id` forward unchanged from `scan-nas.mjs` (`makeId`, md5-based) --
  detail-page routes depend on it;
- dictionary-encode `tags` (sorted), `subs` (sorted), `rels` (sorted, non-null
  only); drop any tag/sub/rel that no model references;
- per-model `filter-index.json` record:
  `{ id, n: name, nl: name.toLowerCase(), t: number[], s: number, r: number|null, th: "<id>.webp" }`;
- emit `src/data/details.json` as
  `{ [id]: { name, tags, subscription, release, relPath, dateAdded } }` where
  `dateAdded = new Date(firstSeenTs).toISOString()` (display only). No
  `sourcePath` (leaks the NAS IP); `relPath` is root-relative. `notes` /
  `attributes` / `collections` are not carried -- `scan-nas.mjs` doesn't resolve
  them (Orynt3D app-DB territory, spec nas-scan-spec.md).
- fail loudly on a missing/duplicate `id`, or if `public/thumbnails/` doesn't
  exist at all. A model whose own `<id>.webp` is missing (no render on the NAS)
  gets `th: "_placeholder.webp"` (a committed grey tile) and a warning -- it
  stays in the gallery, findable by name/tags. `--no-thumb-check` skips the
  per-model check entirely (building against the dev bootstrap).

`src/data/filter-index.example.json` is a **hand-written committed fixture**
(~5 models) documenting the shape -- `build-filter-index.mjs` does not
regenerate it (avoids churn on every data refresh).

## Testing

TDD is standing up for this project as part of the rewrite (currently **no
tests**). Per the global standard, test-first for every new pure-logic module.

- **Runner:** Vitest (ESM project, matches global preference).
- **Component tests:** `@testing-library/preact`.

**Suites:**

| Module | Kind | What it covers |
|---|---|---|
| `src/lib/filter-engine.ts` | unit | bitset build from index; AND tag semantics; OR-within / AND-across group semantics; name-search bitset; `popcount`; facet-count correctness against a brute-force reference over fixtures; empty-result and all-selected edge cases |
| `scripts/build-filter-index.mjs` -- `buildIndex()` | unit | raw -> lean transform; newest-first ordering; dictionary integrity (no orphans, sorted); tag/sub/rel id encoding; details.json shape; loud failure on missing/duplicate id and missing thumbnail. `main()` (fs glue) exempt, same as scan-nas. |
| `src/lib/use-gallery.ts` | unit | state mutators; results + facet counts reflect state; clear keeps sort; hydrate from query string; emits query string on change (deduped); dispose stops emissions |
| `src/lib/url-state.ts` | unit | state <-> query string round-trip; values-not-ids; drops unknown values; tagmode/sort defaults |
| `src/components/GalleryIsland.tsx` | component | tag toggle -> grid + zero-count disable; AND/OR switch; search; sub checkbox; clear-all visibility + reset; hydrate from `initialSearch`; debounced `history.replaceState` |
| `src/lib/grid-layout.ts` | unit | columns-per-row (gap-aware); rowCount; itemRange (half-open, clamped); contentHeight; clampScrollTop (shorter list on Back) |
| `src/pages/m/[id].astro` `getStaticPaths` | unit | every `filter-index.json` id maps to a `details.json` entry; build fails loudly (not silently) on a missing id |
| `scripts/lib/recency.cjs` (D6a) | unit | `firstSeenTs` set on first sight of an id, preserved unchanged after; `addedTs` from birthtime -> mtime -> now fallback. **Done** (step 2). |
| `scripts/lib/model-resolve.mjs` | unit | name/subscription/release/tag/sourceImage resolution -- see `docs/nas-scan-spec.md` -> Testing |
| `scripts/scan-nas.mjs`, `scripts/make-thumbnails.mjs` | -- | exempt (fs walk + NAS I/O + sharp) |
| Astro pages / config | -- | exempt (glue) |

**Proposed coverage threshold** (to be locked in CLAUDE.md `## Test Coverage
Standard` when this spec goes Locked):

- `src/lib/**` (filter engine + helpers): **90%** lines/branches
- `scripts/build-filter-index.mjs` -- `buildIndex()`: **85%** (its `main()` fs glue exempt)
- island components: **70%**
- `src/lib/grid-layout.ts`: **90%** (pure logic, same bar as the filter engine)
- `src/pages/m/[id].astro` `getStaticPaths`: smoke-tested (id/details mapping,
  loud failure on gap) -- no numeric target, it's routing glue
- `scripts/lib/recency.cjs`: **85%** (met -- step 2)
- `scripts/lib/model-resolve.mjs`: **90%** (pure logic; see `docs/nas-scan-spec.md`)
- exempt: `scripts/scan-nas.mjs`, `scripts/make-thumbnails.mjs` (fs/NAS/sharp),
  `scripts/build-nextjs-app.cjs` + `deploy.cjs` (deleted at step 7),
  `astro.config.mjs`, `*.astro` pages

## Build order

Each step is test-first where it has a test row above. A step is not done until
`verify` (live functional check) passes, per the global spec-sync rule.

1. **Scaffold** -- **done** (commit b546feb). Astro + Preact + Vitest.
2. **NAS scan + thumbnails + recency** -- `docs/nas-scan-spec.md` (Locked).
   **Code done** (scan-nas.mjs, model-resolve.mjs, recency.cjs,
   make-thumbnails.mjs; verified on a NAS subset). **Pending:** the full NAS
   run + committing the real `src/data/*.json` + `public/thumbnails|detail/`
   (owner runs `npm run data` when the NAS link is fast; see the dev bootstrap).
3. **`build-filter-index.mjs`** -- **done** (commit 49a77d4). `buildIndex()`
   pure + tested; `filter-index.example.json` committed; `src/data/*.json`
   generated (from the bootstrap for now).
4. **`filter-engine.ts`** -- **done** (commit 603cd1b). Bitsets + facet counts,
   fuzzed vs a naive reference.
5. **Filter island** -- **done**. `use-gallery.ts` (state/engine/URL) +
   `url-state.ts` + `GalleryIsland.tsx` (panel + windowed grid) + `index.astro`.
   Component tests green; `astro build`/`dev` verified.
6. **Windowed grid** -- **done** as part of step 5: `grid-layout.ts` (tested) +
   hand-rolled row windowing in `GalleryIsland.tsx`. Still to verify: scroll
   perf on a throttled mobile profile against the real full snapshot.
7. **Detail pages `/m/[id]`** -- test for `getStaticPaths`'s id/details mapping
   first, then the page (900px image, full metadata, copy-link), static
   about/header/footer, `<ClientRouter />` + `transition:persist` on the island.
   Then **delete** `pages/`, `next.config.js`, `scripts/build-nextjs-app.cjs`,
   `scripts/deploy.cjs`, `.build-cache.json`, Next deps, and
   `git rm --cached -r public/images`.
8. **Netlify** -- point branch deploy at `feat/astro-rewrite`, confirm build
   succeeds with no NAS, smoke-test preview URL.
9. `/code-review`, squash, merge to `main`, delete branch, repoint production if
   needed.

## Out of scope

- Two-level tag grouping `(a+b)|(c+a)` (O2) -- future; engine-ready, UI deferred.
- Fuzzy / trigram search -- plain substring is fast enough at this scale.
- Server-side anything -- stays a static site.
- Grouping view (`groupBy` subscription/release in current UI) -- re-evaluate
  whether it survives; not a v2.0 blocker.
- Collections as a filter facet -- current UI already dropped collections; not
  reviving.

## Phase 2 backlog (post-v2.0)

Nothing here blocks the merge. Deferred deliberately.

**Visual / UX**
- Real styling pass -- v2.0 is functional-not-pretty by choice.
- Detail-page `<img>` CLS: `[id].astro` and the grid Card hardcode square
  `width`/`height`, but thumbnails keep source aspect (`sharp fit: 'inside'`),
  so `/m/[id]` reflows on load (code review #4). Fix: emit real rendition
  dimensions from `make-thumbnails`, or drop the attrs + constrain via CSS box.
- Scroll-restore in `GalleryIsland` runs in a mount-only effect before the
  `ResizeObserver` has measured, so on short viewports it clamps against the
  1024x1200 defaults and shows the wrong row window until first scroll
  (code review #5). Fix: restore after the first measurement.
- Two-level tag grouping (O2).

**Data pipeline**
- `scan-nas` `readdirResilient` uses a synchronous busy-wait backoff (CPU spin,
  up to ~9s per unreadable dir, blocks the progress callback) (code review #3).
  Fix: bound the backoff much lower, or make the walk async.
- `make-thumbnails` mtime skip is unreliable on a fresh clone (git stamps
  clone-time). Container works around it with `--force` (full re-encode each
  run, ~13 min, sharp is deterministic so no spurious commits). A committed
  `{id: {mtime,size}}` source manifest would let both the container and the
  laptop skip unchanged sources efficiently (code review #2).
- Incremental scan: per-subscription top-level mtime skip, `--full` to force
  (nas-container-spec C2). NAS-local a full scan is ~minutes so low priority.
- Container cron / scheduled refresh (nas-container-spec C3).
- WebP -> R2 bucket instead of git, once repo growth stings (nas-container-spec
  C1). Each snapshot re-push is ~294 MB today.

**Data quality (fix on the NAS, then a container re-run picks it up)**
- Move `The Trench - Crustaceans of the Deep/` under `Archvillain Games/`.
- ~194 models get the placeholder thumbnail; confirm which genuinely have no
  render vs. a folder layout `pickSourceImage` misses.

## Resolved questions (all 2026-09-01)

| # | Question | Resolution |
|---|---|---|
| O1 | Modal or full nav to `/m/[id]`? | View Transitions (`<ClientRouter />`) + `transition:persist` island; no modal. |
| O2 | OR toggle within tag group? | AND/OR toggle, default AND, mode in URL. Two-level grouping rejected for v2.0 (engine-ready, UI deferred). |
| O3 | Default sort order? | Newest-first via fs birthtime (`addedTs`) + preserved `firstSeenTs`; sort control offers Newest / Name / Release. |
| O4 | Grid: virtualization or content-visibility + cap? | True row windowing, fixed-height rows, no pagination. Hand-rolled over the unit-tested `grid-layout.ts` rather than `@tanstack/virtual` (uniform heights make it trivial). |
| O5 | Generate WebP thumbs? | Two committed WebP sizes (400px grid, 900px detail) via `sharp` in the extract step; `git rm --cached` the original PNGs. |
| O6 | Bundle details or per-id files? | One bundled `src/data/details.json`, build-time only. |
