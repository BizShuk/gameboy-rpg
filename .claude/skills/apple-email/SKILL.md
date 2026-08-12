---
name: apple-email
description: >
    Use when interacting with Apple Mail.app on macOS via the `email` CLI
    (macemailapp) — listing accounts and mailboxes, reading and searching messages,
    marking read/flagged, moving between mailboxes, or composing and sending mail
    with a dry-run safety gate. Triggers on: "列出我的信箱", "show recent unread mail",
    "mark message 42 as read", "move this mail to Archive", "send mail to ...", or
    any operation against Apple Mail from the terminal.
version: "1.1.0"
allowed-tools: Bash
metadata:
    type: reference
    platforms: [macos]
    prerequisites:
        commands: [email]
---

# Apple Mail CLI (`email`)

操作 macOS `Mail.app` 的命令列工具 (CLI tool),由 `macemailapp` 提供。透過
`ScriptingBridge` 讀取資料、`AppleScript` 寫入狀態,所有寫入類操作
(`mark` / `move` / `send`) 以 `message ID` 為定位依據。

不適用:回覆 (reply) 或轉發 (forward) 既有郵件 (CLI 尚未支援);CC/BCC 寄信
(目前僅支援 TO);附件操作。

## ⚠ 安全閘 (Safety Gate) — 先讀這段

`send` 指令預設為乾跑 (dry-run),必須同時加上 `--no-dry-run --yes` 才會真正寄出。

`不可逆`或`對外可見`的操作,執行前一律先用 `AskUserQuestion` 把最終 payload
(收件人、主旨、ID、目的信箱) 攤給使用者確認 —— 即使使用者稍早已說過「寄出去」
或「刪掉」。CLI 的 flag 是最後一道防線,不是免確認的理由。
提問範本與垃圾桶對照表見
[references/confirmation-protocol.md](references/confirmation-protocol.md)。

| 需要確認的情境                               | 為何需要確認                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `email send --no-dry-run --yes ...`          | 真實寄信,送出後無法收回;對方會收到、對話被永久觸發                 |
| `email move ... --dest-mailbox <Trash-like>` | 移到 `Trash` / `Deleted Messages` 等效等於刪除,之後可能被永久清空 |
| 批次操作 (loop + send/move)                  | 一次處理多封,錯誤被 N 倍放大                                       |
| 跨帳號移動 (`--dest-account` 與 `-a` 不同)   | 改變郵件所在帳號,某些情境下難以還原                                |

`唯讀 (read-only),不需額外確認:` `accounts`、`mailboxes`、`list`、`show`、
預設 dry-run 的 `send`、以及 `mark`(read/unread/flag 為可逆狀態切換)。

## Prerequisites

```bash
email --version
# 若沒有 `email` 指令:
#   uv tool install --python 3.13 git+https://github.com/bizshuk/macemailapp.git
# 在 macemailapp 原始碼目錄內開發時:
#   uv run email ...
```

首次執行 Mail 操作時,macOS 會跳出「自動化」權限提示,需在
`系統設定 > 隱私權與安全性 > 自動化` 中授權給呼叫者 (Terminal / iTerm / 你的腳本)
控制 `Mail`。

## 指令總覽 (Commands)

完整旗標、選項表、exit code 與常見錯誤見
[references/commands.md](references/commands.md);
串接與批次範例見 [references/workflows.md](references/workflows.md)。

| 指令                                                              | 用途                     | 最小範例                                                                             |
| ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `email accounts`                                                  | 列出所有 Mail 帳號       | `email accounts`                                                                     |
| `email mailboxes -a ACCT`                                         | 列出該帳號的信箱         | `email mailboxes -a iCloud`                                                          |
| `email list -a ACCT -m MBOX`                                      | 列出信箱郵件 (可過濾)    | `email list -a iCloud -m INBOX --unread`                                             |
| `email show -a ACCT -m MBOX --id N`                               | 顯示單封郵件             | `email show -a iCloud -m INBOX --id 42`                                              |
| `email mark ... --id N --read`                                    | 標記已讀/未讀/(取消)標記 | `email mark -a iCloud -m INBOX --id 42 --read`                                       |
| `email move ... --id N --dest-account ... --dest-mailbox ...`     | 搬移郵件                 | `email move -a iCloud -m INBOX --id 42 --dest-account iCloud --dest-mailbox Archive` |
| `email send --to ... --subject ... --body ... --from-account ...` | 寄信 (預設 dry-run)      | `email send --to a@b.com --subject Hi --body Yo --from-account iCloud`               |

`-a` = `--account`、`-m` = `--mailbox`、`-j` = `--json` 為通用簡寫。

## 指令關聯 (Domain Flow)

```text
accounts ─┐
          ├─► mailboxes ─► list ─► show ──┐
                                          ├─► mark
                                          └─► move

send (獨立流程,不依賴上述 ID)
```

讀取與搜尋產生 `message ID`,所有狀態變更與移動皆以該 ID 為輸入。

## Rules

- `message ID` 只在該信箱內有效,跨信箱不通用 — 先 `list` 再 `show` / `mark` / `move`
- 帳號與信箱名稱大小寫必須與 `accounts` / `mailboxes` 的輸出一致;含空白要加引號
- `--no-dry-run` 與 `--yes` 必須同時給,缺一即拒送
- 沒有原生 delete;刪除是 `move` 到垃圾桶,永久清空只能在 Mail.app UI 做
- 給腳本或 LLM 消費時用 `--json`(僅 `accounts` / `mailboxes` / `list` 支援)

## Related

- `[[apple-calendar]]` 由郵件安排會議時,行程寫入日曆
- `[[apple-notes]]` 需要保存郵件內容為筆記時
