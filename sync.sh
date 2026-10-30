#!/bin/sh
# Sync the dsh-pet-whale workspace into the DSH plugins folder (link: target).
# Run after every code change; browser-side changes need a page reload,
# host-side changes need a DSH restart.
#
# Layout A (default) — DSH links straight at the workspace, so SRC == DST:
#   ~/projects/dsh-pet-whale  → no copy needed, tests only.
# Layout B (separate install dir) — override the target:
#   DSH_PLUGINS_DIR=~/somewhere ./sync.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DST="${DSH_PLUGINS_DIR:-$HOME/projects}/dsh-pet-whale"
case "$SRC" in
  *-release|*release*)
    echo "refusing: $SRC looks like a release snapshot, not the dev workspace"; exit 1 ;;
esac
if [ "$SRC" = "$DST" ]; then
  echo "in-place layout: DSH loads this workspace directly, skipping rsync"
else
  rsync -a --delete --exclude ".DS_Store" "$SRC/" "$DST/"
  echo "synced: $SRC -> $DST"
fi
cd "$DST" && node test-host.mjs >/dev/null && node test-roam.mjs >/dev/null && node test-notifications.mjs >/dev/null && node test-hit-area.mjs >/dev/null && echo "tests: pass" || { echo "tests: FAILED (synced anyway)"; exit 1; }
