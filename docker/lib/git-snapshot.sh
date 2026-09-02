# docker/lib/git-snapshot.sh
# The git bits of the NAS data-container run, split out so they can be tested
# without Docker or a network (see docker/git-snapshot.test.mjs).
# Sourced by docker/nas-refresh.sh. Assumes CWD is the repo.

SNAPSHOT_SUBJECT_PREFIX="chore(data): snapshot"
# Set by snapshot_sync: SHA of the previous snapshot commit we dropped ("" if none).
PREV_SNAPSHOT=""

# Sync to origin/<branch>, then rewind past the most recent data-snapshot commit
# (dropping it) and replay any code/doc commits that landed on top of it -- so a
# run always rebuilds exactly ONE snapshot commit at the tip, over whatever code
# is underneath, even if someone pushed a commit above the last snapshot.
snapshot_sync() {
  local branch="$1"
  git fetch --quiet origin "$branch"
  git checkout --quiet -B "$branch" "origin/${branch}"
  PREV_SNAPSHOT=""

  # newest commit whose subject starts with the snapshot prefix (grep finding
  # nothing on a first run is normal -- don't let pipefail kill the script)
  local snap
  snap="$( { git log --pretty='%H%x09%s' | grep -F "	${SNAPSHOT_SUBJECT_PREFIX}" || true; } | head -1 | cut -f1)"
  [ -z "$snap" ] && return 0

  PREV_SNAPSHOT="$snap"
  local replay
  replay="$(git rev-list --reverse "${snap}..HEAD")"
  if [ -n "$replay" ]; then
    echo "  rewinding past the last snapshot and replaying $(echo "$replay" | wc -l) commit(s) on top of it"
  else
    echo "  dropping previous snapshot commit to rebuild it"
  fi
  git reset --hard --quiet "${snap}~1"
  for c in $replay; do git cherry-pick --quiet "$c"; done
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
