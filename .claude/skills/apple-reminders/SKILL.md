---
name: apple-reminders
description: >
    Use when managing Apple 提醒事項 (Apple Reminders) on macOS via the `remindctl`
    CLI — listing, creating, editing, completing, or deleting reminders and lists.
    Triggers on: "提醒我", "add reminder", "show today reminders", "complete reminder",
    "delete reminder", "list Reminders", or any Reminders.app operation from the terminal.
version: "1.1.0"
allowed-tools: Bash
metadata:
    type: reference
    platforms: [macos]
    prerequisites:
        commands: [remindctl]
---

# Apple 提醒事項 (apple-reminders / remindctl)

命令列存取 macOS 提醒事項：查詢待辦、建立／完成／刪除事項、以及管理清單。
建立的事項會同步到 iPhone / iPad 的 Reminders app。

```bash
brew install steipete/tap/remindctl   # macOS only；首次執行需授權存取提醒事項
```

## 指令總覽 (Commands)

完整旗標、日期格式與範例見 [references/commands.md](references/commands.md)。

| 指令 | 用途 |
| --- | --- |
| `remindctl status` | 檢查授權狀態 — 權限沒過，其他指令全部空手而回 |
| `remindctl list` | 列出所有清單；`--create` / `--delete` 建立或刪除清單 |
| `remindctl today` | 今天的事項（另有 `tomorrow` / `week` / `overdue` / `all` / `YYYY-MM-DD`） |
| `remindctl add` | 建立事項（`--title` / `--list` / `--due`） |
| `remindctl complete <id>...` | 依 ID 標記完成 |
| `remindctl delete <id>` | 依 ID 刪除 — 破壞性，執行前必須向使用者確認 |

`--due 格式`：`today` / `tomorrow` 等相對詞、`YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、ISO 8601。

## 工作流程 (Workflow)

建立事項前，依序：

1. `remindctl list` 取得可用清單名稱，確認要寫進哪一份。
2. `remindctl add --title ... --list ... --due ...` 建立。
3. 要回頭修改或完成時，先用 `--json` 查出目標事項的 ID，再用 ID 操作。

## Rules

- 一律加 `--json`，輸出才可解析；預設的人類可讀格式不要拿來 parse
- 能用 ID 就不要用標題（標題可能重複或被改字），清單同理先確認名稱存在
- 查詢先給合理的區間（`today` / `week`），不要一次 `all`
- `delete` 屬破壞性操作，執行前必須明確確認
- 日期一律用 ISO 8601 或 `YYYY-MM-DD HH:mm`，不要混用在地格式
- 使用者說「提醒我」時先確認要的是 Reminders.app 事項，而不是本次對話內的口頭提醒

## Related

- `[[apple-calendar]]` 有明確起訖時間的行程歸日曆；有截止日的待辦留在提醒事項
- `[[apple-notes]]` 內容本身（會議記錄、清單正文）歸筆記，提醒事項只放待辦與到期日
