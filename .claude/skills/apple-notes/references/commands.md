# `notes` — 完整指令參考 (Full Command Reference)

## `notes list` — 搜尋筆記

```bash
notes list                          # 全部
notes list -n "週報"                # 名稱含 "週報"
notes list -b "TODO"                # 內文含 "TODO"
notes list -t "X"                   # 名稱或內文含 "X"
notes list -a iCloud -f Notes       # 限定 account + folder
notes list -p                       # 只顯示密碼保護的
notes list -t "X" --json            # JSON 輸出
notes list -t "X" --id-only         # 只印 ID（給 pipeline 用）
```

`-a` 與 `-f` 皆可重複使用以涵蓋多個帳號／資料夾。

## `notes get` — 讀取筆記

```bash
notes get p87                       # 預設 markdown，含 name + body
notes get p87 -f plaintext          # 純文字
notes get p87 -f html
notes get p87 -f json
notes get p87 --name-only           # 只要標題
notes get p87 --body-only           # 只要內文
notes get p87 -s                    # 讀完順便在 Notes.app 開啟
```

格式：`html` / `plaintext` / `markdown`（預設）/ `json`。

## `notes add` — 新增筆記

```bash
# 單行 = 只有標題
notes add "我的標題"

# 多行 = 第一行作為標題，其餘為內文
notes add $'標題\n內文第一行\n內文第二行'

# 從 stdin
cat file.md | notes add -m

# 從檔案
notes add -F ./draft.md -m

# 從 URL（自動清理為可讀版本）
notes add -u https://example.com/article

# 用 $EDITOR 編輯後再存
notes add -e

# 指定帳號／資料夾
notes add "標題" -a iCloud -f Inbox

# 新增後在 Notes.app 顯示
notes add "標題\n內文" -s

# 內文格式：-m markdown / -h html / -p plaintext（預設）
```

預設輸出新筆記的 `ID`；加 `-j` 可得完整 JSON。

## `notes edit` — 編輯（非互動為主）

```bash
notes edit p87 -b "新內文"           # 只改內文
notes edit p87 -n "新標題"           # 只改標題
notes edit p87 -n "新標題" -b "新內文" -m
notes edit p87 -e                    # 用編輯器互動編輯
```

`-m` / `-h` 控制 body 解讀格式（markdown / html），不加則視為 plaintext。

## `notes rename` / `notes move` / `notes delete`

```bash
notes rename p87 "新標題"

notes move p87 -f Archive            # -f 為必填

notes delete p87                     # 會跳確認
notes delete p87 -y                  # 跳過確認，直接刪
```

## `notes selected` — 目前 UI 選取的筆記

```bash
notes selected                       # 名稱 + ID
notes selected --id-only             # 只印 ID
notes selected --json
```

## `notes mkdir` / `notes rmdir` — 資料夾操作

```bash
notes mkdir "Archive"                # 預設帳號下建
notes mkdir "Archive" -a iCloud      # 指定帳號

notes rmdir "Archive"                # 跳確認
notes rmdir "Archive" -y -a iCloud
```

## `notes attach` — 附件

```bash
notes attach add p87 ./photo.jpg         # 新增附件到筆記
notes attach add p87 ./photo.jpg --json

notes attach list p87                    # 列出附件（含 attachment ID）
notes attach list p87 --json

notes attach save p87 p5631 -o ./out     # 下載指定附件
```

`save` 需要兩個 ID：先 note ID、再 attachment ID（從 `list` 取得），`-o` 為必填。

## `notes accounts` / `notes app` / `notes config`

```bash
notes accounts                       # 名稱 + 預設資料夾
notes accounts -j                    # JSON

notes app activate                   # 帶到前景
notes app quit                       # 退出
notes app version                    # 顯示 Notes.app 版本

notes config                         # 互動式設定預設 account、editor、預設格式等
```

## Output Formats

| 格式        | 觸發                         | 適用場景            |
| ----------- | ---------------------------- | ------------------- |
| `Default`   | 不加 flag                    | 人讀，tab 分隔      |
| `JSON`      | `--json` / `-j` 或 `-f json` | 給 LLM、腳本消費    |
| `--id-only` | `-i`                         | shell pipeline 串接 |

`get` 用 `--format json`；其他多數指令用 `--json` / `-j`。

## Exit Codes

| Code  | 意義                       |
| ----- | -------------------------- |
| `0`   | 成功                       |
| `1`   | 錯誤（找不到、參數無效等） |
| `130` | 使用者中斷（Ctrl+C）       |

寫腳本時可用 `$?` 判斷。

## Composing with Other Tools

- 串 `jq` 解析：`notes list -t "X" --json | jq '.[].id'`
- 批次匯出：`notes list --id-only | while read id; do notes get "$id" -f markdown > "$id.md"; done`
- 與 `selected` 配合：在 `Notes.app` 點選一則筆記後，從 terminal 用 `notes selected -i` 抓 ID 直接操作

## See Also

- 上游：[`RhetTbull/macnotesapp`](https://github.com/RhetTbull/macnotesapp)
- 此 fork：[`bizshuk/macnotesapp`](https://github.com/bizshuk/macnotesapp)
- 文件站：[https://RhetTbull.github.io/macnotesapp/](https://RhetTbull.github.io/macnotesapp/)
