# NAS Scan -- Design Spec

**Status:** Locked
**Target:** v2.0 (build-order step 2, replaces the deferred "reuse extract-model-data.cjs" assumption)
**Date:** 2026-09-01 (N1-N4 resolved same day)

## Why this exists

`docs/astro-rewrite-spec.md` assumed *"`extract-model-data.cjs` (NAS scrape ->
JSON) is reusable as-is; only the frontend/build changes."* Verifying step 2
against the live NAS proved that false:

1. **Structure drift.** The committed snapshot's `sourcePath` values point at
   `\\...\3D Files\Rescale Miniatures\...`; the folder is now `Rescale`.
   `orynt3d-pipeline` has reorganised the tree since the last extract (the
   committed snapshot is from ~March 2026).
2. **Config-format drift.** Many current `config.orynt3d` files have **both
   `modelmeta.name: null` and `modelmeta.cover: null`** (all of Witchsong
   Miniatures, all desktop-organised Loot Studios packs).
   `extract-model-data.cjs`'s `isValidModelConfig()` rejects those, so **entire
   subscriptions extract as zero models.**
3. **Inconsistent attribution.** Subscription/release attributes appear at
   different levels per subscription, with inconsistent values, and sometimes
   not at all (Grinning God has no config at any level above the model).

Decision (2026-09-01): **replace `extract-model-data.cjs` now** with a fresh
scanner written against the *current* Orynt3D output, and retire the old script
ahead of build-order step 7 rather than carrying it.

## What the NAS actually looks like (observed 2026-09-01)

Root: `\\192.168.254.200\data\3D Files\` (overridable via `ORYNT3D_DIR`).
Seven subscription folders + some junk (`node_modules/`, `package.json`,
`unzip-models.js` -- an old script, ignore).

### Config levels

`config.orynt3d` is JSON, `version` 5 **or** 6 (both seen; treat as
compatible for the fields below). Three roles, distinguished by
`scancfg.modelMode`:

| Role | `modelMode` | Carries |
|---|---|---|
| Subscription root | `2` | `scancfg.attributes.include` may have `{key:"subscription"}` |
| Pack / release | `2` | `scancfg.attributes.include` may have `{key:"release"}`, `{key:"subscription"}`, `{key:"scale"}` |
| Model (leaf) | `0` | `modelmeta.name` (string **or null**), `modelmeta.tags`, `scancfg.tags.include`, `modelmeta.cover` (UUID or null), `modelmeta.collections` (UUIDs) |

Container folders between pack and model (`Organized/`, `heroes/`, `enemies/`,
`npcs/`, `environment/`, `bonus/`, ...) also have `modelMode: 2` configs with
nothing useful.

### Observed variation (why fallbacks are mandatory)

| Subscription | Sub attr | Release attr | Model `name` | Notes |
|---|---|---|---|---|
| Loot Studios | root config, `"lootstudios"` | **none** -- packs have no config | usually `null` | packs are `{Pack}/Organized/{category}/{model}/`; images like `FN2012AC20.png` |
| Rescale | root `"rescale"`; some packs `"rescale miniatures"` | pack config, e.g. `"molten hearts"` | string (pipeline-written, e.g. `"Drakanchor"`) | model folders `*_Supports`; images `Name_Pose_NN.NNNN.jpg` |
| Witchsong Miniatures | root `"witchsong miniatures"` | **none** | `null` | model folder sits directly under subscription; image is `{FolderName}.png` |
| DM Stash | root config present but **empty** attrs | pack config, `"dm stash"` + `"the fey court"` | `null` | pack config carries the subscription attr instead of the root |
| Archvillain Games | root `"archvillaingames"` | pack config, `"children of null"` (no sub attr) | `null` | `version: 6`; pack has a group-preview image |
| Flesh of Gods | root `"fleshofgods"` | (not surveyed in depth) | mixed | -- |
| Grinning God | **no config at all** | **no config** | -- | `{sub}/May Release/Enemies/...`; everything from folder structure |

`modelmeta.cover` is a UUID like `80b8b9bf-...png` that does **not** exist as a
file in the model folder -- it points into the Orynt3D desktop app's private
store (`%LOCALAPPDATA%\Packages\PlayablePrintsLimited.Orynt3D_*\...\DIPS`, a
locked SQLite DB). **We do not read the app DB.** `cover` and `collections` are
ignored.

## Design

### One new script: `scripts/scan-nas.mjs`

ESM. Walks the NAS, resolves each model, writes a single working file:

```
data/raw/models.json      (GITIGNORED -- working artefact, not committed)
```

Shape (one entry per model):

```jsonc
{
  "scannedAt": "2026-09-01T...Z",
  "root": "\\\\192.168.254.200\\data\\3D Files",
  "models": [
    {
      "id": "drakanchor-1a2b3c4d",
      "name": "Drakanchor",
      "subscription": "Rescale",              // canonical display form (see below)
      "release": "Molten Hearts",
      "tags": ["cr14", "huge", "dragon"],
      "relPath": "Rescale/Molten Hearts/enemies/Drakanchor_Supports",
      "sourceImage": "\\\\...\\Drakanchor_Supports\\StoneBreaker_Drakanchor_Stand_01_02.8300.jpg",
      "addedTs": 1747761676891,               // fs birthtime of the model dir (D6a)
      "firstSeenTs": 1756713600000            // preserved across runs (D6a)
    }
  ]
}
```

Note: **no `sourcePath` with the NAS host** in any committed artefact (spec
Data contract note -- it leaks the internal IP). `relPath` is root-relative.
`sourceImage` is absolute but stays only in the gitignored `data/raw/` file;
`make-thumbnails.mjs` consumes it and it never reaches `filter-index.json` or
`details.json`.

### Resolution rules (the testable core -- `scripts/lib/model-resolve.mjs`)

Pure functions, no fs. `scan-nas.mjs` does the walking + fs and calls these.

**Is this dir a model?**
- It has a `config.orynt3d` with `scancfg.modelMode === 0`, **or**
- (fallback) it is a leaf dir (no subdirectories) with no `config.orynt3d`
  containing >=1 mesh file (`.stl .3mf .obj .chitubox .lys`). An image is **not**
  required -- Grinning God has no configs and some of its models ship no render
  (2026-09-01 full scan found this; the image requirement was dropped).

**`name`** -- first non-empty of:
1. `modelmeta.name` (trimmed, if a non-empty string)
2. cleaned leaf folder name: strip a trailing `_Supports` / `_Supported` /
   `_Unsupported` / `_ReadyToSlice` / `_LYCHEE` / `_FDM`, strip a trailing
   scale token (`_32mm` etc.), replace `_` and multiple spaces with single
   spaces, collapse, trim. (Do **not** force title-case -- keep the source
   casing; `"Drakanchor"` and `"Noel"` are already right.)

**`subscription`** -- walk ancestors nearest-first; first `config.orynt3d` whose
`scancfg.attributes.include` has `{key:"subscription"}` wins; else the first
path segment under the scan root. Then map through a **canonical table** (the
raw values are inconsistent):

| raw value(s) | canonical |
|---|---|
| `lootstudios`, `loot studios` | Loot Studios |
| `rescale`, `rescale miniatures` | Rescale |
| `witchsong miniatures` | Witchsong Miniatures |
| `dm stash` | DM Stash |
| `archvillaingames`, `archvillain games` | Archvillain Games |
| `fleshofgods` | Flesh of Gods |
| `grinning god` | Grinning God |

Unknown raw value -> title-case it and warn (a new subscription folder should
be added to the table).

**`release`** -- walk ancestors nearest-first; first config with
`{key:"release"}` wins (value as-is, then title-cased for display); else the
path segment **immediately under the subscription folder**. If that segment is a
generic container (`Organized`), use the segment above it (the pack folder).

**`tags`** -- union, de-duped, lowercased, stable-sorted, of:
- `modelmeta.tags`
- `scancfg.tags.include` on the model config
- `scancfg.tags.include` on every ancestor config
Drop empty strings. (Scale and support-type are **not** tags in v1 -- revisit.)

**`sourceImage`** -- among image files (`.png .jpg .jpeg .webp`) directly in the
model dir:
1. a file whose name contains `preview` or `hero` (case-insensitive), else
2. the **largest** `.png`, else
3. the largest image of any type, else
4. `null` (model has no image -- reported, and `build-filter-index.mjs` decides
   whether that's fatal per its own spec).
Subdirectory scan (`images/`, `renders/`, ...) as a last resort, like the old
script.

**`id`** -- keep the old scheme for continuity:
`slug(name) + "-" + md5(name + "|" + relPath).slice(0, 8)`, where `slug` is
lowercase, non-alphanumerics -> `-`, collapsed. Ids **will** shift vs the
current committed snapshot (names/paths changed); acceptable -- URL state is by
tag/sub/release, and there are no external inbound `/m/<id>` links to preserve.

### Recency (D6a) -- unchanged from the step 2 work

`scan-nas.mjs` reuses `scripts/lib/recency.cjs`:
- `addedTs` = `computeAddedTs(fs.statSync(modelDir))` every run
- `firstSeenTs` = `mergeFirstSeenTs(id, prior)` where `prior` is loaded from the
  previous `data/raw/models.json` (not `public/orynt3d-data.json` any more)

### Pipeline after this change

```
NAS
 -> scripts/scan-nas.mjs        -> data/raw/models.json          (gitignored)
 -> scripts/make-thumbnails.mjs -> public/thumbnails|detail/*.webp (committed)
 -> scripts/build-filter-index.mjs (step 3)
      -> src/data/filter-index.json  (committed)
      -> src/data/details.json       (committed)
 -> astro build                 (no NAS)
```

`npm run data` = the first three, in order. `make-thumbnails.mjs` gets a small
edit: read `data/raw/models.json` and each entry's `sourceImage` directly
(no more legacy `/images/` resolution -- that path was for the old snapshot).

### What gets retired now

- `scripts/extract-model-data.cjs` -- **deleted**.
- `scripts/deploy.cjs` -- **deleted** (Next.js deploy orchestration; called the
  now-deleted extract script, zero remaining value).
- `scripts/build-nextjs-app.cjs`, `pages/`, `next.config.js`, Next deps -- still
  go at **step 7**. `npm run build:legacy` still runs against the committed
  `public/orynt3d-data.json` (stale but present); it just can't be refreshed
  any more. The legacy Next app is superseded by the Astro scaffold.
- `public/orynt3d-data.json` -- stops being the working file. Left in git for
  now (deleted with the `public/images` cleanup at step 7) so the old snapshot
  stays diffable during the migration.

## Testing

TDD, per the standing rule. The new pure module gets tests first.

| Module | Kind | Covers |
|---|---|---|
| `scripts/lib/model-resolve.mjs` | unit | name fallback chain; subscription walk-up + canonical map + unknown-value warning; release walk-up + container-skip + folder fallback; tag union/dedupe/sort across ancestors; `sourceImage` preference order; id scheme + stability for fixed (name, relPath) |
| `scripts/lib/recency.cjs` | unit | already covered (step 2) |
| `scripts/scan-nas.mjs` | -- | exempt: fs walk + NAS I/O (same rationale as the old script's scan) |
| `scripts/make-thumbnails.mjs` | -- | exempt: sharp + fs |

Coverage target: `scripts/lib/model-resolve.mjs` **90%** (pure logic).
Fixtures: a `tests/fixtures/nas/` tree with a handful of hand-written
`config.orynt3d` files covering each observed subscription shape + Grinning
God's no-config case.

Update `docs/astro-rewrite-spec.md` Testing table and CLAUDE.md Test Coverage
Standard to add `model-resolve.mjs` and drop the `extract-model-data.cjs` row
once this is Locked.

## Build order (replaces step 2 in astro-rewrite-spec.md)

1. `tests/fixtures/build-nas-fixture.mjs` -- temp NAS tree covering every
   observed shape. **Done.**
2. `scripts/lib/model-resolve.mjs` -- tests first, then implementation.
   **Done** (36 unit tests, 100% lines / 94% branches).
3. `scripts/scan-nas.mjs` -- `scanTree()` walk + fs + recency, calling
   model-resolve; `main()` wraps env/file I/O. **Done** (13-case integration
   test against the fixture). Still to do: verify against the real NAS
   (`ORYNT3D_DIR` at one subscription, then full) and inspect
   `data/raw/models.json`.
4. `scripts/make-thumbnails.mjs` -- reads `data/raw/models.json` / `sourceImage`.
   **Done** (`thumbnail-paths.cjs` trimmed to dest-path helpers). Still to do:
   full thumbnail generation run (~4k models, ~500 MB WebP).
5. `.gitignore data/raw/`; `git rm scripts/extract-model-data.cjs`,
   `scripts/deploy.cjs`. **Done.**
6. `package.json` `data` script -> scan-nas; docs + spec sync. **Done.**
7. Commit the code. Then run the real NAS verification (steps 3-4 tails) and
   commit the snapshot -> step 2 done -> resume astro-rewrite-spec.md step 3.

## Resolved questions (2026-09-01)

| # | Question | Resolution |
|---|---|---|
| N1 | Scale / support-type as filterable facets? | **Not in v1.** The pipeline has the data; revisit after the gallery works. `scan-nas.mjs` may still record them in `data/raw/models.json` for later use, but they do not become tags or facets. |
| N2 | `release` display casing? | **Keep the folder name's casing** (`"Molten Hearts"`, `"A Light in the Shadow"`). When the value comes from a config `{key:"release"}` and is all-lowercase, title-case it as a best effort. |
| N3 | Models with no resolvable image? | `scan-nas.mjs` records `sourceImage: null`, does not drop them. `build-filter-index.mjs` gives them `th: "_placeholder.webp"` (committed) and warns with the id list -- **does not hard-fail** (2026-09-01: the full scan had 171 imageless models, all Rescale/Loot; hard-failing would block the whole pipeline). It only hard-fails if `public/thumbnails/` doesn't exist at all. |
| N4 | Keep the `data/raw/` intermediate? | **Keep it.** It is the NAS / no-NAS boundary and makes `build-filter-index.mjs` testable offline. |
