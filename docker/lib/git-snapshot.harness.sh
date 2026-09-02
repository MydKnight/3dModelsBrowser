#!/usr/bin/env bash
# Integration harness for git-snapshot.sh -- no Docker, no network.
# Builds throwaway local repos and exercises the snapshot functions.
# Driven by docker/git-snapshot.test.mjs. Prints "HARNESS OK" on success.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HERE}/git-snapshot.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

git init --quiet --bare remote.git
git clone --quiet remote.git repo
cd repo
git config user.name t; git config user.email t@t

mkdir -p src/data
printf 'src/data/filter-index.json\nsrc/data/details.json\nnode_modules/\n' > .gitignore
echo "code v1" > app.js
git add -A && git commit --quiet -m "feat: initial"
git push --quiet origin HEAD:master

fail() { echo "HARNESS FAIL: $1" >&2; exit 1; }
tip_subject() { git log -1 --pretty=%s; }
snapshot_count() { git log --pretty=%s | grep -cF "$SNAPSHOT_SUBJECT_PREFIX" || true; }

make_data() {
  mkdir -p src/data public/thumbnails
  local arr='' i
  for ((i = 0; i < $1; i++)); do arr="${arr}${arr:+,}0"; done
  echo "{\"models\":[${arr}]}" > src/data/filter-index.json
  echo '{}' > src/data/details.json
  echo x > "public/thumbnails/m$1.webp"
}

# --- run 1: first snapshot -------------------------------------------------
snapshot_sync master
make_data 3
snapshot_unignore
grep -qF 'filter-index.json' .gitignore && fail "unignore left the entry"
snapshot_stage || fail "stage said nothing to commit on first run"
snapshot_commit_and_push master 3
[ "$(snapshot_count)" -eq 1 ] || fail "expected 1 snapshot commit, got $(snapshot_count)"
git cat-file -e HEAD:src/data/filter-index.json || fail "filter-index not committed"

# --- run 2: data changed -> snapshot is dropped and rebuilt (still ONE) ---
snapshot_sync master
[ "$(tip_subject)" = "feat: initial" ] || fail "sync did not drop the old snapshot (tip: $(tip_subject))"
make_data 5
snapshot_unignore
snapshot_stage || fail "run 2 saw no changes"
snapshot_commit_and_push master 5
[ "$(snapshot_count)" -eq 1 ] || fail "run 2: expected 1 snapshot commit, got $(snapshot_count)"
git log -1 --pretty=%s | grep -qF "(5 models)" || fail "run 2 commit message wrong: $(tip_subject)"

# --- run 3: a code commit landed on master -> snapshot re-parents on top --
git clone --quiet "$WORK/remote.git" "$WORK/other"
( cd "$WORK/other" && git config user.name o && git config user.email o@o \
  && git fetch --quiet origin \
  && git checkout --quiet -B master origin/master \
  && git reset --hard --quiet HEAD~1 \
  && echo "code v2" > app.js && git add -A && git commit --quiet -m "feat: v2" \
  && git push --quiet --force origin master )

snapshot_sync master
[ "$(tip_subject)" = "feat: v2" ] || fail "run 3 sync tip should be 'feat: v2', got $(tip_subject)"
make_data 5
snapshot_unignore
if snapshot_stage; then
  snapshot_commit_and_push master 5
fi
[ "$(snapshot_count)" -eq 1 ] || fail "run 3: expected 1 snapshot commit, got $(snapshot_count)"
git log --pretty=%s | grep -qxF "feat: v2" || fail "run 3 lost the code commit"
git log -1 --pretty=%s | grep -qF "$SNAPSHOT_SUBJECT_PREFIX" || fail "run 3 tip is not the snapshot"

# --- run 4: same code, same data -> stage returns non-zero, nothing pushed --
BEFORE="$(git rev-parse origin/master)"
snapshot_sync master
make_data 5
snapshot_unignore
if snapshot_stage; then fail "run 4 should have found nothing to commit"; fi
git fetch --quiet origin master
[ "$(git rev-parse origin/master)" = "$BEFORE" ] || fail "run 4 pushed when it shouldn't have"

# --- run 5: a commit landed ON TOP of the snapshot -> rewind + replay it ------
git fetch --quiet origin master
git checkout --quiet -B master origin/master
[ "$(tip_subject)" = "$(git log -1 --pretty=%s)" ]   # tip is the snapshot
echo "code v3" > app.js
git add -A && git commit --quiet -m "feat: v3 on top of a snapshot"
git push --quiet origin master

snapshot_sync master
git log --pretty=%s | grep -qxF "feat: v3 on top of a snapshot" || fail "run 5 lost the on-top commit"
[ "$(tip_subject)" = "feat: v3 on top of a snapshot" ] || fail "run 5 tip should be the replayed commit, got $(tip_subject)"
[ "$(snapshot_count)" -eq 0 ] || fail "run 5 should have dropped the snapshot, got $(snapshot_count)"
make_data 6
snapshot_unignore
snapshot_stage || fail "run 5 saw no changes"
snapshot_commit_and_push master 6
[ "$(snapshot_count)" -eq 1 ] || fail "run 5: expected 1 snapshot after rebuild, got $(snapshot_count)"
git log --pretty=%s | grep -qxF "feat: v3 on top of a snapshot" || fail "run 5 rebuild lost the code commit"

echo "HARNESS OK"
