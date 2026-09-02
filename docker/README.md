# NAS data container

Runs the 3dModelsBrowser data pipeline (`scan-nas` -> `make-thumbnails` ->
`build-filter-index`) **on the QNAP**, reading the `3D Files` share as local
disk, and pushes one moving `chore(data): snapshot` commit. Replaces the
slow, flaky `npm run data` over SMB-over-VPN.

Design + decisions: `../docs/nas-container-spec.md`.

## This directory is self-contained

Copy **just this `docker/` folder** anywhere on the QNAP (e.g. your
docker-compose share) -- nothing else from the repo is needed, because the
container clones the code from GitHub at runtime. Keep it in sync by re-copying
`docker/` (or keeping a shallow checkout) when these scripts change; they change
rarely.

## One-time setup on the QNAP

Create a `.env` next to `compose.nas.yml` (Compose auto-loads it -- no `export`
needed, survives reconnects). See `.env.example`:

```sh
cd /path/to/copied/docker
cp .env.example .env && chmod 600 .env
# then edit .env:
#   GH_TOKEN     -- fine-grained PAT, this repo only, Contents: Read and write
#   NAS_3DFILES  -- from:  find /share -maxdepth 3 -name '3D Files' -type d
```

Never commit `.env`.

## Run a refresh

```sh
cd /path/to/copied/docker
docker compose -f compose.nas.yml build          # first time / after script changes
docker compose -f compose.nas.yml run --rm nas-refresh
```

- Clones the repo into a named volume (`nas-refresh-repo`); first run installs
  deps, later runs reuse the `nas-refresh-npm` cache volume.
- **Aborts before committing** if `scan-nas` can't read a directory
  (`INCOMPLETE`), and skips the push entirely if the data is byte-identical to
  the last snapshot.
- `TARGET_BRANCH` defaults to `feat/nas-data-container`. Set it to `main` after
  the astro-rewrite branch merges.

## Local dry run (no NAS, no GitHub -- needs Docker running)

```sh
# from the repo root
tmp=$(mktemp -d); git clone --bare -q . "$tmp/remote.git"
DEST="$tmp/nas" node -e "import('./tests/fixtures/build-nas-fixture.mjs').then(m=>{const f=m.buildNasFixture();require('fs').cpSync(f.root,process.env.DEST,{recursive:true});f.cleanup()})"
# fixture images are 1-byte fakes; make them real so sharp can read them:
NAS="$tmp/nas" node -e "const s=require('sharp'),fs=require('fs'),p=require('path');(async()=>{const png=await s({create:{width:64,height:64,channels:3,background:{r:1,g:2,b:3}}}).png().toBuffer();const jpg=await s(png).jpeg().toBuffer();const w=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,e.name);e.isDirectory()?w(q):/\.(png|jpe?g)$/i.test(e.name)&&fs.writeFileSync(q,/jpe?g$/i.test(e.name)?jpg:png)}};w(process.env.NAS)})()"

docker build -t 3dmb-nas-refresh docker/
MSYS_NO_PATHCONV=1 docker run --rm \
  -e GH_REMOTE=file:///remote -e ORYNT3D_DIR=/nas \
  -e TARGET_BRANCH="$(git branch --show-current)" \
  -e GIT_NAME=dryrun -e GIT_EMAIL=dryrun@test \
  -v "$(cygpath -w "$tmp/remote.git"):/remote" \
  -v "$(cygpath -w "$tmp/nas"):/nas:ro" \
  3dmb-nas-refresh
```

The `git-snapshot.sh` flow is also covered by `docker/git-snapshot.test.mjs`
(in `npm test`, no Docker needed).
