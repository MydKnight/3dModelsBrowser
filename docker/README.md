# NAS data container

Runs the 3dModelsBrowser data pipeline (`scan-nas` -> `make-thumbnails` ->
`build-filter-index`) **on the QNAP**, reading the `3D Files` share as local
disk, and pushes one moving `chore(data): snapshot` commit. Replaces the
slow, flaky `npm run data` over SMB-over-VPN.

Design + decisions: `../docs/nas-container-spec.md`.

## One-time setup on the QNAP

1. **GitHub token** -- create a fine-grained PAT scoped to just this repo,
   `Contents: Read and write`. Keep it out of the compose file:

   ```sh
   export GH_TOKEN=github_pat_xxxx…
   ```

2. **Confirm the share path.** Find the real filesystem path to `3D Files`:

   ```sh
   ls -d /share/*/*/3D\ Files 2>/dev/null || find /share -maxdepth 3 -name '3D Files' -type d
   ```

   Set it (compose defaults to `/share/CACHEDEV1_DATA/data/3D Files`):

   ```sh
   export NAS_3DFILES="/share/CACHEDEV1_DATA/<your-share>/3D Files"
   ```

## Run a refresh

```sh
cd /path/to/3dModelsBrowser        # a checkout of this repo on the QNAP
docker compose -f docker/compose.nas.yml build
docker compose -f docker/compose.nas.yml run --rm nas-refresh
```

The container clones the repo fresh into a named volume (`nas-refresh-repo`),
so the QNAP checkout is only needed for the compose + Dockerfile. First run
downloads deps; later runs reuse the `nas-refresh-npm` cache volume.

It **aborts before committing** if `scan-nas` can't read a directory
(`INCOMPLETE`), and skips the push entirely if the data is byte-identical to
the last snapshot.

`TARGET_BRANCH` defaults to `feat/astro-rewrite` (the parked branch this feature
feeds). Change to `main` after the astro-rewrite merge.

## Local dry run (no NAS, no GitHub)

Needs Docker running locally. Uses a `file://` bare repo and a fake tree:

```sh
# a throwaway "remote"
tmp=$(mktemp -d); git clone --bare . "$tmp/remote.git"
# a fake NAS tree (or point at any small config.orynt3d tree)
node -e "import('./tests/fixtures/build-nas-fixture.mjs').then(m=>{const f=m.buildNasFixture();console.log(f.root)})"

docker compose -f docker/compose.nas.yml build
docker run --rm \
  -e GH_REMOTE="file:///remote" -e ORYNT3D_DIR="/nas" -e TARGET_BRANCH="$(git branch --show-current)" \
  -v "$tmp/remote.git:/remote" -v "<fake-tree-path>:/nas:ro" \
  3dmodelsbrowser-nas-refresh
```

The `git-snapshot.sh` flow itself is covered by `docker/git-snapshot.test.mjs`
(runs in `npm test`, no Docker needed).
