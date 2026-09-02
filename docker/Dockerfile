# docker/Dockerfile -- runs the 3dModelsBrowser data pipeline on the QNAP,
# NAS-local (no VPN round trips). x86_64 (TVS-872XT). See docs/nas-container-spec.md.
#
# Build context is this `docker/` directory -- it's self-contained, so the whole
# repo does NOT need to be on the QNAP (the container clones the code at runtime):
#   docker compose -f compose.nas.yml run --rm nas-refresh
#
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# The entrypoint clones the repo into /repo (a volume) and runs `npm ci` there,
# so sharp's linux-x64 prebuilt is always in sync with the repo's lockfile.
COPY nas-refresh.sh /usr/local/bin/nas-refresh
COPY lib/git-snapshot.sh /usr/local/bin/lib/git-snapshot.sh
RUN chmod +x /usr/local/bin/nas-refresh

WORKDIR /repo
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/nas-refresh"]
