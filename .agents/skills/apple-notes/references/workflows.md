# apple-notes — 典型工作流 (Workflows)

## 工作流 1：找到筆記 → 讀內容 → 編輯

```bash
# 1) 用關鍵字找筆記，記下回傳的 partial ID（例如 p87）
notes list -t "週報"

# 2) 讀內容（預設 markdown，含 name + body 區隔）
notes get p87

# 3) 直接覆寫內文（非互動）
notes edit p87 -b "## 本週進度\n- 完成 X\n- 進行 Y" -m

# 4) 或改標題
notes edit p87 -n "2026 W21 週報"
```

## 工作流 2：管線 (pipe) 自動化

```bash
# 取得所有含 "TODO" 的筆記 ID，逐一刪除（謹慎使用）
notes list -t "TODO" --id-only | while read id; do
  notes delete "$id" --yes
done
```

`--id-only` 輸出純 ID（每行一個），最適合給 shell loop 串接。

## 工作流 3：給 LLM / 腳本消費

```bash
notes list -t "週報" --json
notes get p87 --format json
notes accounts --json
```

## 工作流 4：對「目前 UI 選取的筆記」操作

```bash
ID=$(notes selected --id-only)
notes get "$ID"
```

## 工作流 5：外部文件轉 Markdown 後存入筆記

把任意來源（URL / PDF / DOCX…）轉成 Markdown 再長期保存進 Apple Notes。
轉檔本身由 `[[markitdown]]` 負責，本節只管`寫入 Notes` 這一段。

內容規則：

- 只留主要內容：去掉導覽列、頁尾、廣告、側欄等雜訊，只保留正文
- 保留所有連結／參考：markitdown 產出的 `[text](url)` 與引用清單不要刪
- Source 連結要帶頁面標題：在筆記開頭補一行 `Source: [頁面標題](原始 URL)`

```bash
# 1) 轉成 markdown
markitdown https://example.com/article -o /tmp/page.md

# 2) 清掉雜訊、保留正文與連結，並在開頭補上 `Source: [頁面標題](URL)`

# 3) 存入（-m 吃 markdown；-f 指定資料夾）
notes add -F /tmp/page.md -m -f Report
```

要在 Notes 內取得「可點擊超連結 + 原生標題高亮」，改產生 HTML 並用 `notes add -h`
（見下方 Rich Text 說明）。

> 純 URL 文章其實 `notes add -u <URL>` 就會自動抓取並清理；markitdown 路線的價值
> 在於 PDF / DOCX / PPTX 等非 URL 來源，或需要精準控制 Markdown 結構時。

## Rich Text — 產生原生排版

要讓 Apple Notes 呈現`原生排版`（帶高亮效果的 Header、可點擊的 Hyperlink、
Preview Link），必須產生 HTML 並用 `-h` 傳入，不要用 Markdown `-m`：

- `標題`：`<h1>` / `<h2>` / `<h3>` 會轉為原生 Title/Heading 樣式
- `連結`：`<a href="URL">連結文字</a>` 才會附加真正的超連結

Markdown (`-m`) 有時無法完美轉換為原生高亮標題或預覽連結。

## Common Mistakes

| 錯誤                                          | 修正                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| 用筆記「名稱」當參數呼叫 `edit` / `delete`    | 寫入類指令一律吃 `Note ID`，先 `notes list -t "..."` 取 ID |
| `notes move p87`（缺 `-f`）                   | `-f, --folder` 是必填，補上目的資料夾                      |
| 中文／含空白標題沒有 quote                    | 用雙引號包起來：`notes add "週報 W21"`                     |
| 期待 `notes edit` 開編輯器但只給 `-b`/`-n`    | 非互動模式只覆寫；要互動加 `-e`                            |
| 用了 `--markdown` 但 body 是純文字混 `#` 符號 | 不需要 markdown 解析時別加 `-m`，預設 plaintext 即可       |
| 想刪附件                                      | 目前 CLI 不支援，需在 `Notes.app` UI 操作                  |
| 想存取子資料夾筆記                            | 目前 CLI 僅支援頂層資料夾                                  |
| 在密碼保護筆記上呼叫 `get`                    | 鎖定中無法讀取；需先在 `Notes.app` UI 解鎖                 |
| 用 truncated ID（`.../ICNote/p87`）忘記引號   | shell 會解讀 `/`，務必整段加雙引號，或直接用 `p87`         |
| 標題沒有原生高亮效果，或連結無法點擊          | 改用 HTML 格式 (`-h`)，以 `<h1>` 或 `<a href>` 撰寫內容    |
