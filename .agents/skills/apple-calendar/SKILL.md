---
name: apple-calendar
description: >
    Use when interacting with Apple Calendar on macOS via the `accli` CLI. Use it
    for listing calendars, viewing events, creating/updating/deleting calendar events,
    and checking availability/free-busy times. Triggers on: "check my calendar",
    "schedule a meeting", "what's on my schedule", "am I free tomorrow", or any
    calendar-related operations.
version: "1.1.0"
allowed-tools: Bash
metadata:
    type: reference
    platforms: [macos]
    prerequisites:
        commands: [accli]
---

# Apple Calendar CLI (accli)

命令列存取 macOS Apple Calendar：列出日曆、查詢事件、建立／更新／刪除事件、
以及跨日曆查空檔 (free/busy)。

```bash
npm install -g @joargp/accli   # macOS only — 底層使用 JavaScript for Automation
```

## 指令總覽 (Commands)

完整旗標、選項表與範例見 [references/commands.md](references/commands.md)。

| 指令 | 用途 |
| --- | --- |
| `accli calendars` | 列出所有日曆與其 persistent ID — 任何操作前先跑這個 |
| `accli events <cal>` | 查詢區間內事件（`--from` / `--to` / `--query` / `--max`） |
| `accli event <cal> <id>` | 取得單一事件細節 |
| `accli create <cal>` | 建立事件（`--summary` / `--start` / `--end` 必填） |
| `accli update <cal> <id>` | 更新事件，只帶要改的欄位 |
| `accli delete <cal> <id>` | 刪除事件 — 破壞性，執行前必須向使用者確認 |
| `accli freebusy` | 跨日曆查忙碌時段，排除已取消／已婉拒／transparent 事件 |
| `accli config` | 設定／顯示／清除預設日曆 |

`DateTime 格式`：timed 事件用 `YYYY-MM-DDTHH:mm`，all-day 事件用 `YYYY-MM-DD`。

## 工作流程 (Workflow)

建立事件前，依序：

1. `accli calendars` 取得可用日曆名稱與 ID。
2. `accli freebusy` 找出空檔。
3. 與使用者確認事件細節後才建立。

## Rules

- 一律加 `--json`，輸出才可解析
- 能用 `--calendar-id` 就不要用日曆名稱（名稱可能重複或被改名）
- 查詢事件先給合理的日期區間，不要一次拉全部
- `delete` 屬破壞性操作，執行前必須明確確認
- 日期時間一律用 ISO 8601，不要混用在地格式

## Related

- `[[apple-reminders]]` 待辦事項；有截止日的工作歸提醒事項，不要塞進日曆
- `[[apple-notes]]` 會議記錄與筆記
