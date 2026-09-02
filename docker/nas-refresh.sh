#!/usr/bin/env bash
# docker/nas-refresh.sh -- container entrypoint. Runs the 3dModelsBrowser data
# pipeline NAS-local and pushes one moving "chore(data): snapshot" commit.
# See docs/nas-container-spec.md.
set -euo pipefail

: "${GH_REPO:?set GH_REPO, e.g. MydKnight/3dModelsBrowser}"
: "${GH_TOKEN:?set GH_TOKEN (fine-grained PAT, contents:write on GH_REPO)}"
: "${ORYNT3D_DIR:?set ORYNT3D_DIR to the mounted 3D Files path (e.g. /nas/3D Files)}"
export ORYNT3D_DIR
BRANCH="${TARGET_BRANCH:-feat/astro-rewrite}"
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GH_REPO}.git"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/git-snapshot.sh"

cd /repo
if [ ! -d .git ]; then
  echo "→ cloning ${GH_REPO} @ ${BRANCH}"
  git clone --quiet --branch "$BRANCH" "$REMOTE" .
else
  git remote set-url origin "$REMOTE"
fi
git config user.name  "${GIT_NAME:-nas-data-container}"
git config user.email "${GIT_EMAIL:-nas-data-container@users.noreply.github.com}"
git config --global --add safe.directory /repo

echo "→ sync to origin/${BRANCH}"
snapshot_sync "$BRANCH"

echo "→ npm ci"
npm ci --omit=dev --no-audit --no-fund

echo "→ scan-nas"        ; node scripts/scan-nas.mjs
echo "→ make-thumbnails" ; node scripts/make-thumbnails.mjs
echo "→ build-filter-index"
node scripts/build-filter-index.mjs

snapshot_unignore
if ! snapshot_stage; then
  exit 0
fi

N="$(node -e "process.stdout.write(String(require('/repo/src/data/filter-index.json').models.length))")"
snapshot_commit_and_push "$BRANCH" "$N"
echo "✅ pushed snapshot to ${BRANCH} (${N} models)"
