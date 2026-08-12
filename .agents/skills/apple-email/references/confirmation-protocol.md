# apple-email — 確認協定 (Confirmation Protocol)

凡是`不可逆 (irreversible)` 或`對外可見 (externally visible)` 的操作,先用
`AskUserQuestion` 工具向使用者確認,再執行指令。CLI 自己的安全閘
(`--dry-run` / `--yes`) 是最後一道防線,不是免確認的藉口。

`規則 (Rule):` 即使使用者一開始就明確說「寄出去」/「刪除掉」,寫入動作仍要先丟
`AskUserQuestion` 把最終 payload (收件人、主旨、ID、目的信箱) 顯示出來給對方再點
一次,避免 LLM 誤解上下文。

## `AskUserQuestion` 範本

### 寄信前

```text
question: 確認寄出這封郵件?
header: 寄信確認
options:
  - label: 寄出 (Send)
    description: 真的呼叫 Mail.app 寄出;對方會立即收到
  - label: 改回 dry-run
    description: 改為只印預覽,不送出
  - label: 取消
    description: 不寄、不預覽,直接放棄
```

呈現給使用者前,務必把 `to`、`subject`、`body 預覽 (前 5 行)`、`from-account`
一併寫在 `question` 文字裡,讓使用者能在問題本身看清楚要寄什麼。

### 移到 Trash / 刪除前

```text
question: 確認把 message <id> (「<subject>」) 移到 <dest-mailbox>?
header: 刪除確認
options:
  - label: 移到指定資料夾
    description: 執行 email move ... --dest-mailbox <X>;若 X 是 Trash 等於刪除
  - label: 改搬到 Archive
    description: 改用 --dest-mailbox Archive,保留可還原
  - label: 取消
    description: 不動這封信
```

### 批次操作前 (例如 N 封同時 send/move)

```text
question: 即將對 N 封郵件執行 <操作>。確認?
header: 批次確認
options:
  - label: 全部執行
    description: 對所有 N 筆都執行;失敗會在過程中顯示
  - label: 先看清單 (dry-list)
    description: 只印出將被影響的 ID 與 subject,不執行
  - label: 取消
    description: 全部放棄
```

## `send` 安全閘真值表

| `--dry-run / --no-dry-run` | `--yes` | 行為                               |
| -------------------------- | ------- | ---------------------------------- |
| `--dry-run` (預設)         | —       | 印預覽,完全不送                    |
| `--no-dry-run`             | (缺)    | `ClickException`,拒絕送            |
| `--no-dry-run`             | `--yes` | 真的送出,輸出 `SENT (id=<msg_id>)` |

## 「刪除」= move 到垃圾桶

`CLI 沒有原生 delete 指令`,刪除等同於 `move` 到該帳號的垃圾桶信箱。不同帳號類型
的垃圾桶名稱不同,先 `email mailboxes -a ACCT` 確認正確名稱。

| Provider                 | 常見垃圾桶名稱                      |
| ------------------------ | ----------------------------------- |
| iCloud                   | `Deleted Messages`                  |
| Gmail / Google Workspace | `[Gmail]/Trash` 或 `[Gmail]/垃圾桶` |
| Exchange / Outlook       | `Deleted Items`                     |
| 一般 IMAP                | `Trash` / `Bin` / `垃圾桶`          |

此操作把信件搬到垃圾桶,通常可在 Mail.app 內還原。若使用者真的想
`永久刪除 (purge)`,目前 CLI 不支援 — 需在 Mail.app UI 中清空垃圾桶。
