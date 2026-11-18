#!/bin/sh
# Container start for the single TimeWraith image. It makes `docker run` enough, with no compose file and no flags
# other than the data volume and the Docker socket:
#   - finds the name of the volume mounted at /data, so the test containers can mount the case folders from it;
#   - creates the network the Kiro Crew container will share with this one, and joins it as `timewraith`;
#   - gives the app user access to the Docker socket (whatever group owns it), then drops from root to that user.
# Without a Docker socket it still starts, as the app user; the setup page then says Docker is not reachable.
set -eu

SOCK=/var/run/docker.sock
GROUPS_ARG="--clear-groups"

if [ -S "$SOCK" ]; then
  GROUPS_ARG="--groups $(stat -c %g "$SOCK")"
  ME="$(hostname)"
  if [ -z "${TW_DATA_VOLUME:-}" ]; then
    VOL="$(docker inspect "$ME" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' \
      2>/dev/null || true)"
    if [ -n "$VOL" ]; then export TW_DATA_VOLUME="$VOL"; fi
  fi
  # The group name Docker Desktop shows: the compose project label of this container, so the Crew, GitHub and
  # sandbox containers started later carry the same one.
  if [ -z "${TW_PROJECT:-}" ]; then
    PROJECT="$(docker inspect "$ME" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
    if [ -n "$PROJECT" ]; then export TW_PROJECT="$PROJECT"; fi
  fi
  NET="${TW_CREW_NETWORK:-timewraith-net}"
  docker network create "$NET" >/dev/null 2>&1 || true
  docker network connect --alias timewraith "$NET" "$ME" >/dev/null 2>&1 || true
  export TW_CREW_NETWORK="$NET"
  export TW_CREW_BACKEND_URL="${TW_CREW_BACKEND_URL:-http://timewraith:8787}"
fi

chown tw:tw /data 2>/dev/null || true
export HOME=/home/tw # not /root: the Docker CLI would warn that it cannot read /root/.docker
# shellcheck disable=SC2086 # GROUPS_ARG is two words on purpose
exec setpriv --reuid=1000 --regid=1000 $GROUPS_ARG "$@"
