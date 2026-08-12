---
name: cleaning-vscode-forks
description: Use when Antigravity, Cursor, Windsurf, or another VS Code fork is eating excessive RAM or disk — many sidecar processes, a ballooning extensions directory, duplicate parallel installs, or the user quoting a memory number from the IDE's own process panel.
---

# Cleaning VS Code Forks

## Overview

AI-fork memory scales with **window count**, not project size. Every window clones a
full sidecar stack: renderer + extension host + AI language server + browser-agent MCP
+ one forked node worker per LSP extension. Measured on Antigravity: **~1.2 GB per
window**.

Measure first, then pull levers in cost order. Every destructive step below has a
guard — do not skip the guards.

## When to Use

- IDE RAM feels disproportionate to what's open
- Extensions directory is gigabytes
- Two versions of the app installed side by side (post-rename, e.g. `Foo.app` + `Foo IDE.app`)
- User quotes a number from the IDE's built-in process explorer

**Not for:** one slow extension (profile it instead), or genuine large-repo indexing cost.

## Paths Differ Per Fork — Resolve Them First

Everything below is **measured on Antigravity**. Other forks use the same layout with
different names. Resolve and verify before running anything:

```bash
APP="Antigravity IDE"          # "Cursor" | "Windsurf" | "Code"
EXT_DIR=~/.antigravity-ide/extensions    # ~/.cursor/extensions | ~/.windsurf/extensions
DATA_DIR="$HOME/Library/Application Support/$APP"
CLI="/Applications/$APP.app/Contents/Resources/app/bin/<cli-name>"

ls -d "$EXT_DIR" "$DATA_DIR" && ls -l "$CLI"    # all three must exist before proceeding
```

Fork-specific caveat: **first-party sidecars cannot be uninstalled.** Cursor's and
Windsurf's AI language servers ship inside the app; only *extension*-provided sidecars
(Step 2) are removable there.

## Step 1 — Measure Correctly

**Never trust the IDE's built-in process explorer.** It lists only first-level children
of the main process and misses forked LSP workers, AI sidecar binaries, MCP servers and
`gopls`. Observed under-report: **2.5 GB shown vs 6038 MB actual (-60%)**.

```bash
ps -Ao rss,args | grep -F "/Applications/$APP.app" | grep -v grep |
  awk '{s+=$1} END {printf "total: %.0f MB\n", s/1024}'

ps -Ao pid,ppid,rss,args | grep -F "/Applications/$APP.app" | grep -v grep |
  awk '{printf "%6.0f MB  PID %-7s PPID %-7s %s\n", $3/1024,$1,$2,substr($0,index($0,$4),70)}' |
  sort -rn | head -20

ps -Ao args | grep -F "Helper (Renderer).app/Contents/MacOS" | grep -vc grep
```

Record **(total, window count)** as a pair. Renderers also back some webviews, so
cross-check the count against the Window menu once before trusting it.

**Compare per-window, same instrument, same window count.** A total that rose while
windows went 3→5 may still be a large win. Never compare a `ps` baseline to a
panel-reported "after". Cache clearing is a **disk** lever — measure it with `du`, it
should not move RSS at all.

## Step 2 — Levers, In Cost Order

| Lever | Typical saving | Notes |
|---|---|---|
| Close idle windows | ~1.2 GB each | Biggest single lever, always |
| Uninstall extensions that fork node workers | 60–120 MB per window each | Docker/containers, YAML, remote packs |
| Uninstall extensions shipping a binary sidecar | ~70 MB per window | Only works where the sidecar is extension-provided |
| Delete dead extension dirs | disk only | Step 3 |
| Remove duplicate install | 2+ GB disk | Step 4 |
| Clear caches | 2–3 GB disk | Step 5 — safety-critical |

Uninstall, don't disable — disabled extensions still cost scan time and disk.

```bash
"$CLI" --list-extensions
"$CLI" --uninstall-extension <publisher.name>
```

Removing an extension **pack** cascades to its members. Sidecar processes survive
uninstall until the window reloads — reload, or kill by PID after confirming the
parent is an extension host and not your own shell.

## Step 3 — Dead Extension Directories

**`.obsolete` entries are marked but never actually deleted.** Old versions accumulate
forever (observed: 4 versions of one extension = 1091 MB; 14 versions of another).
`.obsolete` is also *incomplete* — it misses unregistered orphans. The authoritative
source is the registration list in `extensions.json`.

`location` schema varies across builds. Handle both shapes, **abort on anything
suspicious**, and stage rather than delete:

```python
import json, os, shutil
base = os.path.expanduser(os.environ['EXT_DIR'])
entries = json.load(open(f'{base}/extensions.json'))

def dirname_of(e):
    loc = e.get('location') or {}
    p = loc.get('path') or loc.get('fsPath') or e.get('relativeLocation') or ''
    return os.path.basename(p.rstrip('/'))

reg  = {d for d in map(dirname_of, entries) if d}
dirs = [d for d in os.listdir(base) if os.path.isdir(f'{base}/{d}')]
dead = [d for d in dirs if d not in reg]

# GUARDS — any trip means the schema was not understood. Do not delete.
assert reg,                    "ABORT: registration set empty — unknown schema"
assert len(reg) <= len(dirs),  "ABORT: more registered than on disk"
assert len(dead) < len(dirs),  "ABORT: every dir looks dead — schema mismatch"

print(f"registered={len(reg)} on-disk={len(dirs)} dead={len(dead)}")
for d in dead: print("  ", d)        # eyeball this list before continuing

stage = f'{base}/../_dead_ext_stage'   # move, don't delete
os.makedirs(stage, exist_ok=True)
for d in dead:
    shutil.move(f'{base}/{d}', f'{stage}/{d}')
```

Restart the IDE, confirm everything still works, **then** delete the staging dir.
Re-run after any extension auto-update — an update instantly orphans the old version.

## Step 4 — Duplicate Installs

Applies only to forks that renamed themselves (Antigravity: `Antigravity.app` →
`Antigravity IDE.app`). If no second app exists, skip — this is not a universal step.

All three must hold before deleting:

```bash
ls -d "/Applications/$OLD.app"                                        # exists
ps -Ao args | grep -F "/Applications/$OLD.app" | grep -vc grep        # == 0
find "$HOME/Library/Application Support/$OLD" -type f \
  -newermt "$(date -v-7d +%F)" | wc -l                                # == 0
```

Copy `User/settings.json`, `User/keybindings.json`, `User/snippets/` out first.

## Step 5 — Cache Cleanup (Safety-Critical)

Disposable, regenerates, 2–3 GB:
`Cache`, `CachedData`, `blob_storage`, `Code Cache`, `GPUCache`, `CachedExtensionVSIXs`,
`Crashpad`, `logs`. `WebStorage` is disposable but holds webview state — **back it up
first**.

**NEVER DELETE — these live in the same parent and do not regenerate:**
`User/globalStorage/` (incl. `state.vscdb`), `User/workspaceStorage/`, `User/History/`,
`User/settings.json`, `User/keybindings.json`, `User/snippets/`.

Requires the IDE **fully quit**. If your agent session runs inside that IDE's terminal
you cannot do this inline — use the detached watcher in `watcher.sh` (same directory).

### THE TRAP: `pgrep -f` silently returns 0 for paths containing spaces on macOS

```bash
ps -o args= -p 12011
#  /Applications/Antigravity IDE.app/Contents/MacOS/Electron      <- running

pgrep -f 'Antigravity IDE.app/Contents/MacOS/Electron'       # -> 0    WRONG
ps -Ao args | grep -F "Antigravity IDE.app" | grep -vc grep  # -> 38   correct
```

A watcher gated on `pgrep -f` reads "already quit" on the first tick and deletes live
data. This happened: a watcher was ~10 seconds from removing 1.4 GB of in-use
`WebStorage`.

The fix introduces a mirror-image bug: if the watcher's own command line contains the
search string, it counts itself and **never fires**. Exclude your own PID, and store
the script at a path that does not contain the app name.

Any script that **deletes when a condition is absent** needs three gates:

1. **Startup reverse-check** — the condition must be *present* at launch, proving
   detection works. Absent at tick one means broken detection or wrong premise; abort.
2. **N consecutive confirmations** (3 × 15 s), counter reset on reappearance.
3. **Final re-check** immediately before the destructive call.

### Measuring across the required restart

Quitting destroys the window count the "after" reading depends on. Record
`(total, windows)` before quitting; after relaunch, **reopen the same set of projects**
and re-measure. Report RAM as per-window and disk as `du` — never mix them.

## Common Mistakes

| Mistake | Consequence |
|---|---|
| Quoting the IDE panel's number | Optimising a 60%-underreported baseline |
| Comparing totals across a changed window count | Real gains look like regressions |
| Comparing `ps` before to panel after | Meaningless delta |
| Disabling instead of uninstalling | Disk and scan cost remain |
| Using `.obsolete` to find dead dirs | Misses unregistered orphans |
| Trusting one `extensions.json` schema | Empty registration set → deletes every extension |
| `rmtree` straight away | No rollback when a live extension was misclassified |
| `pgrep -f` as a destructive-script gate | Deletes live data |
| Deleting `workspaceStorage`/`History` as "cache" | Permanent loss of chat and editor history |
| Deleting caches with the IDE running | Corrupts session state |

## Real-World Impact

Antigravity, 16 GB Mac: 6038 MB → 4743 MB total while windows went 3 → 5, i.e.
**2013 → 949 MB per window (-53%)**. Disk: extensions 2.6 GB → 541 MB, plus 2.1 GB of
duplicate install removed.
