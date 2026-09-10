#!/usr/bin/env bash
# Run on the target Linux server only, after following README.md setup.
set -euo pipefail
base=${APP_PATH:-/var/www/everywhere-tools}
app_port=${APP_PORT:-3007}
release=$(realpath -e "${1:?Pass the extracted release directory}")
[[ "$release" == "$base/releases/"* && -f "$release/dist/index.html" && -f "$release/server.js" && -f "$release/chat-server.js" ]] || { echo 'Invalid release directory.' >&2; exit 1; }
[[ ! -e "$base/current" || -L "$base/current" ]] || { echo 'current must be a symlink.' >&2; exit 1; }
[[ ! -e "$base/.next" && ! -L "$base/.next" ]] || { echo 'An unfinished .next link exists; inspect it first.' >&2; exit 1; }
previous=$(readlink -f "$base/current" || true)
ln -s "$release" "$base/.next"
mv -Tf "$base/.next" "$base/current"
if sudo systemctl restart everywhere-tools; then
    for attempt in {1..15}; do
        if curl --fail --silent --max-time 2 "http://127.0.0.1:$app_port/api/health" >/dev/null; then
            echo "Active release: $release"
            exit 0
        fi
        sleep 1
    done
fi
echo 'Health check failed. Restoring the previous release when available.' >&2
if [[ -n "$previous" && "$previous" != "$release" && -d "$previous" ]]; then
    ln -s "$previous" "$base/.next"
    mv -Tf "$base/.next" "$base/current"
    sudo systemctl restart everywhere-tools
else
    sudo systemctl stop everywhere-tools
fi
journalctl -u everywhere-tools -n 30 --no-pager >&2
exit 1
