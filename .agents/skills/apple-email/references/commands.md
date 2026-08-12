# `email` — 完整指令參考 (Full Command Reference)

`-a` = `--account`、`-m` = `--mailbox`、`-j` = `--json` 為通用簡寫。

## `email accounts` — 列出帳號

```bash
email accounts            # 一行一個帳號名稱
email accounts -j         # JSON 陣列
```

預期輸出 (例):

```
iCloud
Work
Gmail
```

## `email mailboxes` — 列出信箱

```bash
email mailboxes -a iCloud                 # rich 表格 (Name / Count)
email mailboxes --account iCloud --json   # JSON: [{name, count}, ...]
```

`-a` / `--account` 為必填;帳號名稱大小寫需與 `email accounts` 一致。

## `email list` — 搜尋郵件

```bash
email list -a iCloud -m INBOX                          # 預設 limit 20
email list -a iCloud -m INBOX --limit 50
email list -a iCloud -m INBOX --subject "週報"          # 主旨 substring 過濾
email list -a iCloud -m INBOX -f "alice@x.com"         # 寄件人 substring
email list -a iCloud -m INBOX --unread                 # 只未讀
email list -a iCloud -m INBOX --flagged                # 只已標記
email list -a iCloud -m INBOX --unread --flagged       # 未讀且已標記
email list -a iCloud -m INBOX --subject "ERROR" --json # JSON 給腳本
```

| Flag        | 別名 | 預設   | 說明                          |
| ----------- | ---- | ------ | ----------------------------- |
| `--account` | `-a` | (必填) | 帳號名稱                      |
| `--mailbox` | `-m` | (必填) | 信箱名稱                      |
| `--subject` | `-s` | None   | 主旨 substring (大小寫不敏感) |
| `--from`    | `-f` | None   | 寄件人 substring              |
| `--unread`  | —    | False  | 只列未讀                      |
| `--flagged` | —    | False  | 只列已標記                    |
| `--limit`   | —    | `20`   | 最多回傳筆數                  |
| `--json`    | `-j` | False  | JSON 輸出                     |

JSON 欄位:`id`、`subject`、`sender`、`date_received` (ISO 8601)、`read`、`flagged`。

## `email show` — 顯示單封內容

```bash
email show -a iCloud -m INBOX --id 42            # 純文字 body (rich panel)
email show -a iCloud -m INBOX --id 42 --source   # RFC822 原始碼
```

`--id` 為必填的整數 ID,從 `email list` 取得。找不到時會以 `ClickException` 退出。

`效能提醒 (Performance note):` 目前實作 (`show.py:16`) 會載入整個信箱再用 Python
filter 找出指定 ID;大型信箱會偏慢。若需高頻查詢,改走 Python API:

```python
from macemailapp import MailApp
m = MailApp().account("iCloud").mailbox("INBOX")
```

## `email mark` — 標記狀態

```bash
email mark -a iCloud -m INBOX --id 42 --read         # 標已讀
email mark -a iCloud -m INBOX --id 42 --unread       # 標未讀
email mark -a iCloud -m INBOX --id 42 --flag         # 加標記
email mark -a iCloud -m INBOX --id 42 --unflag       # 取消標記
email mark -a iCloud -m INBOX --id 42 --read --flag  # 同時改兩個
```

`--read` / `--unread` 為一對布林,`--flag` / `--unflag` 為一對布林;兩組至少要給
其中一個,否則拋 `UsageError`。

## `email move` — 搬移郵件

```bash
# 同帳號內搬資料夾
email move -a iCloud -m INBOX --id 42 \
  --dest-account iCloud --dest-mailbox Archive

# 跨帳號搬
email move -a Work -m INBOX --id 42 \
  --dest-account iCloud --dest-mailbox Archive

# 含空白的信箱名稱:用雙引號
email move -a iCloud -m INBOX --id 42 \
  --dest-account iCloud --dest-mailbox "Sent Messages"
```

`--dest-account` 與 `--dest-mailbox` 皆必填;搬完輸出
`moved <id> -> <dest-account>/<dest-mailbox>`。

## `email send` — 寄信

```bash
# 預設 dry-run:只印預覽,完全不接觸 Mail.app
email send \
  --to alice@example.com \
  --subject "Hello" \
  --body "Hi Alice" \
  --from-account iCloud

# 真的寄出 (必須兩個 flag 同時給)
email send --no-dry-run --yes \
  --to alice@example.com \
  --subject "Hello" \
  --body "Hi Alice" \
  --from-account iCloud

# 多行 body:用 $'...\n...' 或 heredoc
email send \
  --to alice@example.com \
  --subject "Report" \
  --body $'Hi Alice,\n\n本週進度如下:\n- 完成 A\n- 進行 B\n\n--\nShuk' \
  --from-account iCloud
```

| Flag                       | 必填 | 預設        | 說明                                      |
| -------------------------- | ---- | ----------- | ----------------------------------------- |
| `--to`                     | ✓    | —           | 單一收件人 (TO);目前不支援 CC/BCC         |
| `--subject`                | ✓    | —           | 主旨                                      |
| `--body`                   | ✓    | —           | 內文 (純文字)                             |
| `--from-account`           | ✓    | —           | 寄送帳號名稱 (對應 `email accounts` 結果) |
| `--dry-run / --no-dry-run` | —    | `--dry-run` | 預設預覽不送                              |
| `--yes`                    | —    | False       | 配合 `--no-dry-run` 才真正寄出            |

安全閘真值表見 [confirmation-protocol.md](confirmation-protocol.md)。

## Output Formats

| 格式                     | 觸發            | 適用場景       |
| ------------------------ | --------------- | -------------- |
| 預設 (rich 表格 / panel) | 不加 flag       | 終端機人讀     |
| JSON                     | `--json` / `-j` | LLM / 腳本消費 |

只有 `accounts`、`mailboxes`、`list` 支援 `--json`;`show`、`mark`、`move`、`send`
沒有 JSON 輸出。

## Exit Codes

| Code  | 意義                                                                             |
| ----- | -------------------------------------------------------------------------------- |
| `0`   | 成功                                                                             |
| `1`   | `ClickException` (例:`message id N not found`、`refusing to send without --yes`) |
| `2`   | `UsageError` (例:`mark` 沒給任何 read/flag flag、缺必填參數)                     |
| `130` | 使用者中斷 (Ctrl+C)                                                              |

## Common Mistakes

| 錯誤                                                | 修正                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 加 `--no-dry-run` 但忘了 `--yes`                    | 兩個一定要同時給;只給 `--no-dry-run` 會被拒絕                                                          |
| 用 `--dry-run --yes` 期待會寄出                     | `dry-run` 永遠不送;要寄必須改為 `--no-dry-run --yes`                                                   |
| 帳號 / 信箱名稱大小寫不符                           | 先 `email accounts` / `email mailboxes -a X` 確認確切名稱                                              |
| 含空白的信箱名稱沒 quote                            | `--mailbox "Sent Messages"`,別寫成 `--mailbox Sent Messages`                                           |
| 拿 `email list` 表格的 ID 直接用,但碰到表格輸出截斷 | 改用 `--json` 取得完整 ID 與所有欄位                                                                   |
| `email show --id N` 找不到                          | ID 是該信箱內的 ID,跨信箱不通用;先 `email list -a A -m M` 確認                                         |
| 期望 `email send` 支援 CC/BCC                       | 目前不支援,只有 TO;暫時改在 `Mail.app` UI 操作                                                         |
| 期望 `email reply` 或 `email forward`               | 目前不支援,僅能 `send` 全新郵件                                                                        |
| 期待 `email draft` 指令                             | 原始碼有 `draft.py` 但未在 `cli.py` 註冊,實際不可呼叫;若需要,可在 `cli.py` 加 `cli.add_command(draft)` |
| 大信箱 `email show` 慢                              | `show` 會 load 整個信箱再 filter;改用 Python API 或縮小 mailbox                                        |

## See Also

- CLI 入口:`macemailapp/cli/cli.py`
- 指令實作目錄:`macemailapp/cli/commands/`
- Python API 對應實作:`macemailapp/mailapp.py`
- AppleScript handlers:`macemailapp/macmailapp.applescript`
