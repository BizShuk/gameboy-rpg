---
name: apple-notes
description: >
    Use when working with Apple Notes (macOS Notes.app) from the command line via
    the `notes` CLI (macnotesapp / bizshuk fork, ID-first design) — listing, reading,
    creating, editing, deleting, moving notes, managing folders and attachments,
    or controlling Notes.app. Triggers on: "列出我的筆記", "list my Apple notes",
    "新增備忘錄", "edit a note", "find note containing X", "delete note by ID",
    "add attachment", "create folder in Notes".
version: "1.1.0"
allowed-tools: Bash
metadata:
    type: reference
    platforms: [macos]
    prerequisites:
        commands: [notes]
    defaults:
        folder: Report
---

# Apple Notes CLI (`notes`)

操作 macOS `Notes.app` 的命令列工具。此 fork (`bizshuk/macnotesapp`) 採
`ID-first` 設計：所有寫入類操作（`get` / `edit` / `delete` / `rename` / `move` /
`attach`）一律以 `Note ID` 定位，避免同名筆記造成歧義。

不適用：密碼保護鎖定中的筆記（無法存取）；非頂層的子資料夾（CLI 尚未支援）。

## Prerequisites

```bash
notes --version
# 若無 `notes` 指令，任選一種安裝：
#   uv tool install git+https://github.com/bizshuk/macnotesapp.git
#   uvx git+https://github.com/bizshuk/macnotesapp.git
#   brew tap bizshuk/macnotesapp https://github.com/bizshuk/macnotesapp && brew install macnotesapp
```

於 macnotesapp 專案原始碼目錄內開發時，改用 `uv run notes ...`。

## Note ID 三種形式

| 形式           | 範例                              | 用途                                  |
| -------------- | --------------------------------- | ------------------------------------- |
| `Full ID`      | `x-coredata://A1B2.../ICNote/p87` | 完整 ID，由 `Notes.app` 內部產生      |
| `Truncated ID` | `.../ICNote/p87`                  | `notes list` 預設輸出格式（人眼好讀） |
| `Partial ID`   | `p87`                             | 只給尾段；CLI 自動解析為 full ID      |

寫入類指令三種形式皆可接受，最常用 `partial ID`（例：`notes get p87`）。

## 指令總覽 (Commands)

完整旗標與範例見 [references/commands.md](references/commands.md)；
串接、批次與 rich text 範例見 [references/workflows.md](references/workflows.md)。

| 指令                                | 用途               | 最小範例                               |
| ----------------------------------- | ------------------ | -------------------------------------- |
| `notes list`                        | 列出／搜尋筆記     | `notes list -t "週報"`                 |
| `notes get ID`                      | 讀取筆記內容       | `notes get p87`                        |
| `notes add NOTE`                    | 新增筆記           | `notes add "標題\n內文"`               |
| `notes edit ID`                     | 編輯名稱／內文     | `notes edit p87 -b "新內容"`           |
| `notes rename ID NEW`               | 改標題             | `notes rename p87 "新標題"`            |
| `notes move ID`                     | 搬資料夾           | `notes move p87 -f Archive`            |
| `notes delete ID`                   | 刪除筆記           | `notes delete p87 -y`                  |
| `notes selected`                    | 取得目前選取的筆記 | `notes selected -i`                    |
| `notes mkdir NAME`                  | 建資料夾           | `notes mkdir Archive`                  |
| `notes rmdir NAME`                  | 刪資料夾           | `notes rmdir Archive -y`               |
| `notes attach add ID FILE`          | 新增附件           | `notes attach add p87 ./img.jpg`       |
| `notes attach list ID`              | 列出附件           | `notes attach list p87`                |
| `notes attach save ID AID -o DIR`   | 下載附件           | `notes attach save p87 p5631 -o ./out` |
| `notes accounts`                    | 列帳號             | `notes accounts -j`                    |
| `notes app activate\|quit\|version` | 控制 Notes.app     | `notes app activate`                   |
| `notes config`                      | 修改預設值         | `notes config`                         |

## Defaults

預設資料夾為 `Report`。預設帳號以 `notes config` 的設定為準 —
不確定時先跑 `notes accounts` 確認這台機器上實際存在哪些帳號，不要臆測。

- 使用者未指定帳號或資料夾時，帶入預設值（`-f Report`）
- 使用者明確指定時，一律以使用者指定為準

## Rules

- 寫入類指令只吃 `Note ID`，不吃筆記名稱 — 先 `notes list` 取 ID
- 要原生標題高亮與可點擊連結，用 HTML (`-h`) 而非 Markdown (`-m`)
- `notes move` 的 `-f` 是必填
- 刪除前確認；批次刪除務必先用 `--id-only` 檢視清單
- 給腳本或 LLM 消費時用 `--json`；給 shell loop 用 `--id-only`

## Related

- `[[daily-summary]]` 把每日彙整寫入 Apple Notes
- `[[apple-reminders]]` 待辦事項；有截止日的項目歸提醒事項，不要寫成筆記
