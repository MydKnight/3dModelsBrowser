# docker/lib/git-snapshot.sh
# The git bits of the NAS data-container run, split out so they can be tested
# without Docker or a network (see docker/git-snapshot.test.mjs).
# Sourced by docker/nas-refresh.sh. Assumes CWD is the repo.

SNAPSHOT_SUBJECT_PREFIX="chore(data): snapshot"
# Set by snapshot_sync: SHA of the previous snapshot commit we dropped ("" if none).
PREV_SNAPSHOT=""

# Sync the working tree to origin/<branch>, then -- if the tip commit is our
# previous data snapshot -- drop it, so each run rebuilds ONE snapshot commit
# that moves forward over whatever code commits are underneath.
snapshot_sync() {
  local branch="$1"
  git fetch --quiet origin "$branch"
  git checkout --quiet -B "$branch" "origin/${branch}"
  PREV_SNAPSHOT=""
  if git log -1 --pretty=%s | grep -qF "$SNAPSHOT_SUBJECT_PREFIX"; then
    PREV_SNAPSHOT="$(git rev-parse HEAD)"
    echo "  dropping previous snapshot commit to rebuild it"
    git reset --hard --quiet HEAD~1
  fi
}

# Un-ignore the generated snapshot files (they're gitignored for the laptop dev
# flow; the container is what commits them).
snapshot_unignore() {
  local gi=.gitignore
  [ -f "$gi" ] || return 0
  grep -vE '^(src/data/filter-index\.json|src/data/details\.json)$' "$gi" > "${gi}.tmp"
  mv "${gi}.tmp" "$gi"
}

# Stage everything. Returns non-zero (no error) when there is nothing worth
# committing: nothing generated, OR the full tree is byte-identical to the
# previous snapshot (data unchanged AND sitting on the same code).
snapshot_stage() {
  git add -A
  if git diff --cached --quiet; then
    echo "  nothing generated -- skipping"
    return 1
  fi
  if [ -n "$PREV_SNAPSHOT" ] \
     && [ "$(git write-tree)" = "$(git rev-parse "${PREV_SNAPSHOT}^{tree}")" ]; then
    echo "  identical to the last snapshot (same data, same code) -- skipping"
    git reset --hard --quiet HEAD
    return 1
  fi
  return 0
}

snapshot_commit_and_push() {
  local branch="$1" model_count="$2"
  git commit --quiet -m "${SNAPSHOT_SUBJECT_PREFIX} $(date -u +%Y-%m-%dT%H:%MZ) (${model_count} models)"
  git push --force-with-lease origin "$branch"
}
