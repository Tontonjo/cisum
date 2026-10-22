#!/bin/sh
# Cisum v0.3.0 - Container entrypoint.
# Started as root: creates the data folder, gives it to PUID:PGID, then runs Cisum as that user.
# Started as another user (docker "user:" option): runs Cisum directly.
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA="${CISUM_DATAFOLDER:-/data}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA"
    # Only fix ownership when the top folder is wrong, to keep restarts fast on big caches
    if [ "$(stat -c '%u:%g' "$DATA")" != "$PUID:$PGID" ]; then
        echo "Cisum: giving $DATA to $PUID:$PGID"
        chown -R "$PUID:$PGID" "$DATA"
    fi
    exec su-exec "$PUID:$PGID" /app/cisum "$@"
fi

exec /app/cisum "$@"
