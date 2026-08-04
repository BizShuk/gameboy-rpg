#!/usr/bin/env bash
# run.sh — 建立 metadata 目錄後啟動 server (可重複執行)
set -euo pipefail
cd "$(dirname "$0")"

CONFIG_DIR="$HOME/.config/game1"
mkdir -p "$CONFIG_DIR/data" "$CONFIG_DIR/logs"

# 首次執行時放一份設定範例 (不覆蓋既有設定)
if [ ! -f "$CONFIG_DIR/game1.yaml" ] && [ -f config/example/game1.yaml ]; then
  cp config/example/game1.yaml "$CONFIG_DIR/game1.yaml"
  echo "seeded $CONFIG_DIR/game1.yaml"
fi

go build -o "$CONFIG_DIR/game1" ./cmd/game1
exec "$CONFIG_DIR/game1" "$@"
