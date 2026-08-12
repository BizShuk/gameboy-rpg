# remindctl 指令參考 (Command Reference)

## 檢視提醒事項 (View Reminders)

- `remindctl`：今天的提醒事項
- `remindctl today`：今天
- `remindctl tomorrow`：明天
- `remindctl week`：本週
- `remindctl overdue`：已過期 (Past due)
- `remindctl all`：全部 (Everything)
- `remindctl 2026-01-04`：指定特定日期

## 管理列表 (Manage Lists)

- `remindctl list`：列出所有列表
- `remindctl list Work`：顯示名為 Work 的特定列表
- `remindctl list Projects --create`：建立名為 Projects 的新列表
- `remindctl list Work --delete`：刪除名為 Work 的列表

## 建立提醒事項 (Create Reminders)

- `remindctl add "Buy milk"`：簡單新增事項
- `remindctl add --title "Call mom" --list Personal --due tomorrow`：指定列表為 Personal 並設定截止時間為明天
- `remindctl add --title "Meeting prep" --due "2026-02-15 09:00"`：設定特定日期與時間

## 完成與刪除 (Complete/Delete)

- `remindctl complete 1 2 3`：透過 ID 完成指定的提醒事項
- `remindctl delete 4A83 --force`：透過 ID 強制刪除提醒事項

## 輸出格式 (Output Formats)

- `remindctl today --json`：以 JSON 格式輸出 (適合腳本處理與解析)
- `remindctl today --plain`：以 TSV 格式輸出 (純文字)
- `remindctl today --quiet`：僅顯示數量計數

## 日期與時間格式 (Date Formats)

`--due` 參數及日期過濾支援下列格式：

- `today`, `tomorrow`, `yesterday`
- `YYYY-MM-DD` (例如：`2026-01-04`)
- `YYYY-MM-DD HH:mm`
- ISO 8601 (例如：`2026-01-04T12:34:56Z`)

## 初始設定 (Setup)

```bash
brew install steipete/tap/remindctl
```

僅支援 macOS，當系統跳出權限請求時，請允許存取「提醒事項」。

- 檢查狀態：`remindctl status`
- 請求權限存取：`remindctl authorize`
