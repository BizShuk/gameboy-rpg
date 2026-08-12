# apple-email — 典型工作流 (Workflows)

## 工作流 1:找出未讀信並標為已讀

```bash
# 1) 列出 iCloud 帳號下 INBOX 的未讀信 (JSON 給後續腳本處理)
email list -a iCloud -m INBOX --unread --json

# 2) 取得單封 ID 後標為已讀
email mark -a iCloud -m INBOX --id 42 --read

# 3) 批次:把所有未讀全部標為已讀
email list -a iCloud -m INBOX --unread --json \
  | python3 -c 'import sys,json; [print(m["id"]) for m in json.load(sys.stdin)]' \
  | while read id; do
      email mark -a iCloud -m INBOX --id "$id" --read
    done
```

## 工作流 2:搜尋特定寄件人 → 預覽 → 歸檔

```bash
# 找來自 boss@example.com 的信
email list -a "Work" -m INBOX --from "boss@example.com" --limit 5

# 看其中一封內容
email show -a "Work" -m INBOX --id 1234

# 搬到 Archive (同帳號)
email move -a "Work" -m INBOX --id 1234 \
  --dest-account "Work" --dest-mailbox "Archive"

# 跨帳號搬:從 Work/INBOX 搬到 iCloud/Archive
email move -a "Work" -m INBOX --id 1234 \
  --dest-account "iCloud" --dest-mailbox "Archive"
```

## 工作流 3:安全寄信 (三段式)

```bash
# 第 1 段:預覽 (預設 dry-run,不會送出)
email send \
  --from-account "iCloud" \
  --to "alice@example.com" \
  --subject "Weekly Report" \
  --body "本週進度:..."

# 第 2 段:加 --no-dry-run 但忘了 --yes → 仍會拒絕,提醒補 --yes
email send --no-dry-run \
  --from-account "iCloud" \
  --to "alice@example.com" \
  --subject "Weekly Report" \
  --body "本週進度:..."
# Error: refusing to send without --yes ...

# 第 3 段:同時加 --no-dry-run --yes 才會真的寄出
email send --no-dry-run --yes \
  --from-account "iCloud" \
  --to "alice@example.com" \
  --subject "Weekly Report" \
  --body "本週進度:..."
```

## 工作流 4:「刪除」郵件 (透過 move 到 Trash)

垃圾桶名稱對照表與注意事項見
[confirmation-protocol.md](confirmation-protocol.md)。

```bash
# 1) 先用 mailboxes 看清楚目的信箱真實名稱
email mailboxes -a iCloud

# 2) 「刪除」單封 — 執行前必須走 AskUserQuestion 確認
email move -a iCloud -m INBOX --id 42 \
  --dest-account iCloud --dest-mailbox "Deleted Messages"

# 3) 批次「刪除」所有符合條件的信 — 同樣必須先 AskUserQuestion
email list -a iCloud -m INBOX --from "spam@x.com" --json \
  | jq -r '.[].id' \
  | while read id; do
      email move -a iCloud -m INBOX --id "$id" \
        --dest-account iCloud --dest-mailbox "Deleted Messages"
    done
```

## 工作流 5:導出單封郵件原始碼 (debug / 證據保存)

```bash
# --source 改為印 RFC822 原始碼 (含完整 header)
email show -a iCloud -m INBOX --id 42 --source > mail_42.eml
```

## 工作流 6:給 LLM / 腳本消費的結構化資料

```bash
email accounts --json
email mailboxes -a iCloud --json
email list -a iCloud -m INBOX --unread --limit 50 --json
```

## Composing with Other Tools

```bash
# 用 jq 取 ID
email list -a iCloud -m INBOX --unread --json | jq -r '.[].id'

# 用未讀數量觸發 macOS 通知
n=$(email list -a iCloud -m INBOX --unread --json | jq 'length')
[ "$n" -gt 0 ] && osascript -e "display notification \"$n unread\" with title \"Mail\""

# 把指定主旨的信全部歸檔
email list -a iCloud -m INBOX --subject "Newsletter" --json \
  | jq -r '.[].id' \
  | while read id; do
      email move -a iCloud -m INBOX --id "$id" \
        --dest-account iCloud --dest-mailbox "Newsletters"
    done

# 取 source 後丟給 ripmime / mhonarc / 自家解析器
email show -a iCloud -m INBOX --id 42 --source | head -50
```
