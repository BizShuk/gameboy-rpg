#!/usr/bin/env bash
# run.sh — 建立 metadata 目錄後啟動 server (可重複執行)
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG_DIR="$HOME/.config/gameboy-rpg"
mkdir -p "$CONFIG_DIR/data" "$CONFIG_DIR/logs"

# 首次執行時放一份設定範例 (不覆蓋既有設定)
if [ ! -f "$CONFIG_DIR/gameboy-rpg.yaml" ] && [ -f config/example/gameboy-rpg.yaml ]; then
  cp config/example/gameboy-rpg.yaml "$CONFIG_DIR/gameboy-rpg.yaml"
  echo "seeded $CONFIG_DIR/gameboy-rpg.yaml"
fi

go build -o "$CONFIG_DIR/gameboy-rpg" ./cmd/gameboy-rpg
exec "$CONFIG_DIR/gameboy-rpg" "$@"
