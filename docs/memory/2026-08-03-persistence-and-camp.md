# 2026-08-03 — 進度持久化與地下層平衡 (Persistence & Camp)

## 做了什麼

- `持久化`：`game.Store` 介面 (Load/Save `Progress`) + `MemStore`；
  檔案實作獨立成 `store/` package (JSON 全量寫 + tmp→rename 原子落盤 +
  毀損自動重來)。斷線即存, 另每 30s 自動存 (server 被 kill 也保住)。
  以`玩家名稱`為 key，存 quest/裝備/金幣/背包, `不存座標` (重連回城)。
  預設 `~/.config/game1/data/players.json`，`-save ""` 停用。
- `地下層平衡`：`TileMap.Safe` 重構為 `Safes []Rect` (多安全區)，
  新增地下層`入口營地` (雙營火 tile `^`, 怪禁入 + 回血)；入口不再生石像鬼。
  幽影 8→7 傷、石像鬼 14→12、兩者索敵 7u→5.5u (黑暗中近了才發現)；
  史萊姆王索敵 11u→7u / leash 16u→10u (讓玩家能繞側廊上階梯)；
  魔像震地蓄力 1s→1.25s；安全區回血 2/0.5s → 3/0.4s。
- `視覺`：營火 sprite + 光暈, 營地整片提亮, `樓板遮蔽` (地下層鏡頭跨越
  row 64 時上方補實心黑, 不再漏出地面草地)。HUD 區域標示加 `CAMP 營地`。

## 決策

- 存檔不含座標：避免玩家卡在 Boss 房重連即死；回城也符合 RPG 慣例。
- Store 介面留在 `game/`, 檔案 I/O 在 `store/`：`game/` 維持零 I/O 依賴,
  測試用 MemStore 不碰磁碟。cmd 負責注入 (組裝根)。

## 驗證

- `go test ./...` 三個 package 全綠：新增 save_test (斷線→續玩/零數量物品不存/
  別名不受影響/無 store 不持久化) 與 store/file_test (落盤重開讀回/毀損容錯/
  不留 .tmp)；world_test 增營地安全區與營火可走斷言。
- CDP 實測：接任務+買劍→關分頁→`players.json` 落盤→同名重連 quest/gold/
  weapon 完整復原 (RESUME_OK)，新名字仍是全新角色。營地截圖確認提亮與無怪。

## 踩雷

- `Safe` 改 `Safes` 是跨 server/client 的 wire 變更 (`init.safe` 由 rect
  變 rect 陣列)，client `insideSafe` 與光照都要跟；漏改會靜默失效 (不報錯)。
