# Astro Rewrite -- Design Spec

**Status:** Locked
**Target:** v2.0
**Date:** 2026-09-01 (open questions O1-O6 resolved same day)

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
int. Estimated ~120-180 bytes/model wire -> ~0.6-0.9 MB for 5k models,
gzip ~150-250 KB. Acceptable as a single `client:load` fetch; shard later only if
that projection is wrong.

**Full metadata** (`notes`, `attributes`, `collections`, `sourcePath`,
`relativeSourcePath`, `dateAdded`, image) -- **not in the island payload at
all**. It lives in a single build-time file `src/data/details.json` (`{ id:
{...meta} }`), which the static detail pages inline per-id (D3, O6). The browser
never fetches it.

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

**Live facet counts** (the part naive implementations get wrong): for every tag
shown in the panel, display how many models the *current* result set would still
contain if that tag were also selected. That is
`popcount(resultBitset AND tagBitset[t])` for each of ~250 tags -> 250 x 160-word
popcount ~= 40k ops. Recompute synchronously on every change; no memo needed at
this size. Use the standard SWAR popcount over `Uint32`.

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

- `@tanstack/virtual` (`virtual-core`, framework-agnostic, thin Preact binding).
- Cards are **uniform height** -> fixed-size *row* virtualization. Only extra
  work: a `ResizeObserver` on the grid container computing columns-per-row from
  width, so the virtualizer maps result items to rows.
- Render visible rows + ~2 rows overscan. DOM card count stays ~20-40 regardless
  of result-list size; per-update cost is constant.
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

`build-filter-index.mjs` is the single source of the contract. It must:

- sort models by `firstSeenTs ?? addedTs` **descending** and assign ordinals in
  that order (ordinal 0 = newest); a snapshot's ordinals are fixed for that
  snapshot (a data refresh reassigns them, which is fine -- URL filter state is
  by tag/sub/release value, not ordinal);
- carry `id` forward unchanged from `extract-model-data.cjs`
  (`generateStableId`, md5-based) -- detail-page routes depend on it;
- dictionary-encode `tags` (sorted), `subs`, `rels`; drop any tag/sub/rel that no
  model references;
- emit `src/data/details.json` as `{ [id]: { name, notes, tags, collections,
  attributes, subscription, release, relativeSourcePath, dateAdded } }` (no
  `sourcePath` -- it leaks the NAS IP; keep `relativeSourcePath` only);
- fail loudly if a model has no `id`, no thumbnail, or no `details.json` entry.

A committed `src/data/filter-index.example.json` with ~5 representative models
documents the shape in-repo (replaces the never-created
`orynt3d-data.example.json` gap).

## Testing

TDD is standing up for this project as part of the rewrite (currently **no
tests**). Per the global standard, test-first for every new pure-logic module.

- **Runner:** Vitest (ESM project, matches global preference).
- **Component tests:** `@testing-library/preact`.

**Suites:**

| Module | Kind | What it covers |
|---|---|---|
| `src/lib/filter-engine.ts` | unit | bitset build from index; AND tag semantics; OR-within / AND-across group semantics; name-search bitset; `popcount`; facet-count correctness against a brute-force reference over fixtures; empty-result and all-selected edge cases |
| `scripts/build-filter-index.mjs` | unit | raw -> lean transform; dictionary integrity (no orphan ids, sorted); ordinal stability; id passthrough; loud failure on missing id/thumb |
| filter island | component | toggle tag -> grid + counts update; AND/OR mode switch; sort control (Newest/Name/Release) reorders result slice; clear-all; sub/release + tag combined; URL read on mount / write on change; zero-result state |
| `src/lib/grid-layout.ts` | unit | columns-per-row from container width at breakpoints; row-index <-> item-index mapping for the virtualizer; overscan bounds at list start/end; `scrollTop` save/restore round-trip |
| `src/pages/m/[id].astro` `getStaticPaths` | unit | every `filter-index.json` id maps to a `details.json` entry; build fails loudly (not silently) on a missing id |
| `scripts/lib/recency.cjs` (D6a) | unit | `firstSeenTs` set on first sight of an id, preserved unchanged after; `addedTs` from birthtime -> mtime -> now fallback. **Done** (step 2). |
| `scripts/lib/model-resolve.mjs` | unit | name/subscription/release/tag/sourceImage resolution -- see `docs/nas-scan-spec.md` -> Testing |
| `scripts/scan-nas.mjs`, `scripts/make-thumbnails.mjs` | -- | exempt (fs walk + NAS I/O + sharp) |
| Astro pages / config | -- | exempt (glue) |

**Proposed coverage threshold** (to be locked in CLAUDE.md `## Test Coverage
Standard` when this spec goes Locked):

- `src/lib/**` (filter engine + helpers): **90%** lines/branches
- `scripts/build-filter-index.mjs`: **85%**
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

1. **Scaffold** -- new Astro project in place, Preact integration, Vitest wired,
   `.gitignore` updated. Old Next.js files stay until step 7.
2. **NAS scan + thumbnails + recency** -- see **`docs/nas-scan-spec.md`**
   (Locked). Replace `extract-model-data.cjs` with `scripts/scan-nas.mjs` +
   `scripts/lib/model-resolve.mjs` (test-first); recency (`recency.cjs`) and
   thumbnail generation (`make-thumbnails.mjs`) done, thumbnails need the small
   edit to read `data/raw/models.json`. Verify against a NAS subset, then full.
3. **`build-filter-index.mjs`** -- tests, then implementation. Produce committed
   `filter-index.json` + details + `filter-index.example.json`. Sort newest-first
   for ordinal assignment.
4. **`filter-engine.ts`** -- tests (incl. brute-force reference for facet counts,
   AND + OR modes, sort modes), then implementation. No DOM.
5. **Filter island** -- panel (tags with live counts, AND/OR toggle, subs,
   releases, search, sort control, clear-all), wired to the engine, URL sync.
   Component tests.
6. **Windowed grid** -- tests for `grid-layout.ts` (column math, row mapping,
   scrollTop round-trip) first, then implementation: `@tanstack/virtual`
   fixed-height rows, ResizeObserver-driven columns, lazy thumbnails, wired-up
   save/restore for Back. Verify scroll perf on a throttled-CPU mobile profile
   with the full 4k snapshot.
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

## Resolved questions (all 2026-09-01)

| # | Question | Resolution |
|---|---|---|
| O1 | Modal or full nav to `/m/[id]`? | View Transitions (`<ClientRouter />`) + `transition:persist` island; no modal. |
| O2 | OR toggle within tag group? | AND/OR toggle, default AND, mode in URL. Two-level grouping rejected for v2.0 (engine-ready, UI deferred). |
| O3 | Default sort order? | Newest-first via fs birthtime (`addedTs`) + preserved `firstSeenTs`; sort control offers Newest / Name / Release. |
| O4 | Grid: virtualization or content-visibility + cap? | True virtualization (`@tanstack/virtual`), fixed-height rows, no pagination. |
| O5 | Generate WebP thumbs? | Two committed WebP sizes (400px grid, 900px detail) via `sharp` in the extract step; `git rm --cached` the original PNGs. |
| O6 | Bundle details or per-id files? | One bundled `src/data/details.json`, build-time only. |
