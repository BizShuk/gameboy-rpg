#!/usr/bin/env bash
# Wait until a VS Code fork has fully quit, then clear its disposable caches.
#
# Usage:
#   APP="Antigravity IDE" nohup /path/to/watcher.sh >/dev/null 2>&1 &
#
# IMPORTANT: store this script at a path that does NOT contain the app name,
# otherwise its own command line matches the detector and the cleanup never fires.
#
# WHY NOT pgrep: macOS `pgrep -f` silently returns 0 for paths containing spaces.
# A watcher gated on it reads "already quit" on tick one and deletes live data.
set -uo pipefail

APP="${APP:?set APP, e.g. APP=\"Antigravity IDE\"}"
DATA="$HOME/Library/Application Support/$APP"
LOG="$HOME/Desktop/${APP// /-}-cache-clean.log"
BACKUP="$HOME/Desktop/${APP// /-}-webstorage-backup.tar.gz"
INTERVAL=15
CONFIRMATIONS=3
DEADLINE=$(( $(date +%s) + 86400 ))

# Disposable only. Never add User/globalStorage, User/workspaceStorage,
# User/History, settings.json, keybindings.json or snippets — they do not regenerate.
PURGE=(WebStorage Cache CachedData blob_storage "Code Cache" GPUCache
       CachedExtensionVSIXs Crashpad)

log() { echo "[$(date '+%F %T')] $*" >>"$LOG"; }

# Count app processes, excluding this watcher and the grep pipeline.
app_procs() {
  ps -Ao pid,args |
    grep -F "/Applications/$APP.app" |
    grep -v "grep" |
    awk -v me="$$" -v pp="$PPID" '$1 != me && $1 != pp' |
    wc -l | tr -d ' '
}

log "=== watcher started for '$APP' ==="

[ -d "$DATA" ] || { log "ABORT: data dir not found: $DATA"; exit 1; }

# GATE 1 — reverse-check. The app MUST be running now, proving detection works.
# Zero at startup means broken detection or wrong premise; never proceed to delete.
INITIAL=$(app_procs)
log "startup detection: $INITIAL processes"
if [ "$INITIAL" -eq 0 ]; then
  log "ABORT: app not detected at startup — detection broken or app already closed."
  log "       Refusing to delete. Verify with: ps -Ao args | grep -F '/Applications/$APP.app'"
  exit 1
fi

# GATE 2 — N consecutive zero readings, reset on reappearance.
log "waiting for quit (${INTERVAL}s poll, needs $CONFIRMATIONS consecutive zeros, 24h max)"
zeros=0
while [ "$zeros" -lt "$CONFIRMATIONS" ]; do
  [ "$(date +%s)" -gt "$DEADLINE" ] && { log "timed out after 24h, giving up"; exit 1; }
  sleep "$INTERVAL"
  n=$(app_procs)
  if [ "$n" -eq 0 ]; then
    zeros=$((zeros + 1)); log "zero reading ($zeros/$CONFIRMATIONS)"
  elif [ "$zeros" -ne 0 ]; then
    log "app reappeared ($n processes), resetting"; zeros=0
  fi
done

log "quit confirmed, settling 10s for file handles"
sleep 10

# GATE 3 — final re-check immediately before anything destructive.
[ "$(app_procs)" -eq 0 ] || { log "ABORT: app relaunched"; exit 1; }

log "before: $(du -sh "$DATA" 2>/dev/null | cut -f1)"

if [ -d "$DATA/WebStorage" ]; then
  log "backing up WebStorage -> $BACKUP"
  if tar -czf "$BACKUP" -C "$DATA" WebStorage 2>>"$LOG"; then
    log "backup ok: $(du -sh "$BACKUP" 2>/dev/null | cut -f1)"
  else
    log "ABORT: backup failed, not deleting anything"; exit 1
  fi
fi

for d in "${PURGE[@]}"; do
  [ -d "$DATA/$d" ] || continue
  sz=$(du -sh "$DATA/$d" 2>/dev/null | cut -f1)
  rm -rf "${DATA:?}/$d" && log "  purged $d ($sz)"
done

log "after: $(du -sh "$DATA" 2>/dev/null | cut -f1)"
log "done. Caches rebuild on next launch (first start is slower)."
log "once verified: rm '$BACKUP'"
