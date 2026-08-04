# game1 — 技術脈絡 (Technical Context)

Pokemon 風格多人連線動作 RPG demo。業務定義與玩法見 `README.md`。

## 結構 (Structure)

```tree
game1/
├── cmd/game1/main.go        # 進入點：gosdk config → 組裝 store→World→Hub→HTTP
├── run.sh                   # 建 metadata 目錄 + build + 執行 (pm2 script)
├── ecosystem.config.js      # pm2 常駐設定 (Go 版 pm2, 路徑字面值)
├── config/example/          # 設定範例 (複製到 ~/.config/game1/)
├── game/                    # 遊戲領域 (無網路依賴, 可獨立測試)
│   ├── map.go               # 地圖邏輯: 碰撞、safe zone、TilesOf (資料見 map_gen.go)
│   ├── map_gen.go           # 生成地圖資料 (map_generator 產物; mapRows/Portals/生怪區/NPC 落點)
│   ├── items.go             # 武器/防具/藥水定義與商店清單
│   ├── player.go            # 玩家屬性、輸入、移動
│   ├── monster.go           # 怪物數值模板與 AI (wander/chase/leash/boss 技能)
│   ├── story.go             # 主線劇情: Stages/NPCs/對話狀態機/任務推進
│   ├── world.go             # 世界狀態機：Tick、戰鬥、掉落、重生、outbox、快照
│   ├── save.go              # 進度模型 Progress + Store 介面 + MemStore
│   ├── world_test.go        # 地圖/碰撞/安全區/購買/戰鬥 unit tests
│   ├── save_test.go         # 斷線存檔 → 同名續玩
│   └── story_test.go        # 劇情全程 E2E (兩章 S0→S13) + 防呆 + 掉落/召喚
├── store/                   # 持久化實作 (game.Store 的檔案版)
│   ├── file.go              # JSON 全量存檔 + 原子 rename + 毀損容錯
│   └── file_test.go
├── server/                  # 網路層
│   ├── protocol.go          # JSON wire 訊息 (ClientMsg/InitMsg/StateMsg/TextMsg)
│   ├── delta.go             # 差分快照 (只送變動實體 + 移除清單, 2s 一次 keyframe)
│   ├── hub.go               # 連線集散 + 20Hz 主迴圈 (單 goroutine 擁有 World)
│   ├── client.go            # gorilla/websocket 讀寫 pump
│   ├── http.go              # 路由：靜態檔 + /ws upgrade
│   └── integration_test.go  # httptest + ws client 端到端測試
├── web/
│   ├── embed.go             # go:embed 靜態資源
│   └── static/              # client (無外部依賴, 全 vanilla)
│       ├── iso/             # 等角視界 client (map_generator bundle 產物, 見決策 16)
│       ├── assets/          # 等角皮膚資產 (tileset/materials, map_generator 同步)
│       ├── index.html       # canvas + join/shop/toast overlay
│       ├── style.css        # DOM overlay 樣式
│       └── client.js        # 渲染/netcode/輸入/特效 (string-art pixel sprites)
└── docs/                    # terminology 與 memory
```

## 關鍵決策 (Key Decisions)

- `決策 1 — server-authoritative 20Hz tick`：client 只上報輸入狀態與攻擊
  edge-trigger；World 每 50ms 模擬並廣播全量 JSON 快照，client 端指數插值。
  demo 規模 (數十實體) 下全量快照最簡單且夠用，不做 delta/binary。
- `決策 2 — World 單 goroutine 所有權`：`Hub.Run` 的 select 迴圈同時處理
  register/unregister/inbox/tick，World 完全無鎖。慢客戶端丟幀 (send chan
  滿了 skip)，不阻塞主迴圈。
- `決策 3 — 地圖為 ASCII rows 常數`：ASCII 字元陣列即是地圖 source of truth，
  init 直送 client 渲染；寬度錯誤啟動即 panic 並有測試。
  safe zone 為 tile 矩形 (圍籬內側)，怪物移動時硬性禁入。tile 字元清單見
  `map.go` 檔頭註解 (廣場/水井/路燈/橋/農田等裝飾各有專屬字元)。
- `決策 16 — 等角視界 client (2026-08-04)`：`web/static/iso/` 是第二個 client
  (與 string-art 版並存,join 畫面互連)。由 `../map_generator` 的
  `apps/game1-client` (PixiJS + IsoRenderer + 皮膚鏈 + 生成素材) esbuild bundle
  而來,走同一條 `/ws` 協議與 20Hz 快照;rows 經 `fromGame1Rows` 反向還原成
  MapDocument 做等角渲染,實體為 procedural billboard。此 client 例外於
  「決策 4 零資產檔」:皮膚資產 (tileset/materials/portal.gif) 隨 embed 打包於
  `web/static/assets/`。再生:map_generator 內 `node apps/game1-client/build.mjs`
  → 重建 game1。
- `決策 15 — 地圖資料由 map_generator 生成 (2026-08-04)`：`game/map_gen.go` 是
  `../map_generator` 的 `/api/generate/game1?format=gofile` 產物 (seed `g1-std`,
  56x120)，含 `mapRows`、`dungeonTopRow`/`voidTopRow`、`Portals` (深淵門
  MinQuest 14)、`ShrineGate`/`AbyssGate`/`CoreAltar` 觸發區、`genSafes`/
  `genSpawnTile`、`DefaultSpawnAreas()` (18 條生怪區含四 boss) 與
  `genNPCTiles` (elder/smith 落點)；`map.go` 只留型別與查詢邏輯，
  `story.go` NPC 座標吃 `genNPCTiles`。換圖 = 重打 API 覆蓋 `map_gen.go`
  (指令見該檔檔頭)，測試已全面改為生成資料驅動 (BFS 通路 / TilesOf 掃描,
  不寫死座標)。`spawnMonster` 增加安全區禁生格判斷；init 下行新增
  `dtop`/`vtop`，client 層界改 init 驅動 (fallback 64/88)。
- `決策 4 — client 零資產檔`：所有 sprite 為 client.js 內 string-art，tile
  由程式繪製進 offscreen atlas；無圖檔、無外部字型/CDN，單 binary 全內嵌。
- `決策 5 — 設定走 gosdk config.Default`：`cmd` 啟動時
  `config.Default(config.WithAppName("game1"))`，優先序
  `flag > APP_* 環境變數 > ~/.config/game1/*.yaml > viper 內建預設`；
  舊的 `PORT` env 仍相容。存檔預設落在 `config.GetAppConfigDir()/data/`。
- `決策 10 — 進度持久化以名稱為 key，World 不碰檔案`：`game.Store` 是介面
  (`Load`/`Save`)，`game/` 只認 `Progress` 值物件；檔案實作在 `store/`，
  由 `cmd` 注入。存 quest/裝備/金幣/背包，`不存座標` (重連一律回城)。
  斷線時存 + 每 30s 自動存 (被 kill 也保住)。預設路徑
  `~/.config/game1/data/players.json`，`-save ""` 可關閉。
- `決策 12 — 多層地圖以 row 分段, 傳送門串接`：同一張 ASCII 地圖縱向分三段
  (地上 0-63 / 地下層 64-87 / 月之裏側 88-119)，界線常數在 `map.go`
  (`dungeonTopRow`/`voidTopRow`)。層間移動一律走 `Portals` 表 (踩到即傳送,
  `MinQuest` 為劇情閘門)；client 依鏡頭所在 row 決定該層氛圍 (光照/極光)
  並補`樓板遮蔽`。好處：地圖、碰撞、快照全部沿用單層邏輯，零額外狀態。
- `決策 11 — 安全區為多矩形`：`TileMap.Safes []Rect` (綠泉鎮 + 地下層營地)，
  wire `init.safe` 為 rect 陣列。營地讓地下層有補給節奏，也是 client
  光照提亮的依據。
- `決策 6 — 雙商店與武器參數化`：櫃檯 `C`=武器店、`A`=道具店，`Item.Store`
  決定歸屬，Buy 驗證玩家貼近的櫃檯類型。武器以 `CD/Reach/Radius` 三參數
  差異化 (攻速/觸距/判定半徑)，徒手預設在 `items.go` (`FistCD` 等)。
  消耗品含限時 buff (`SpeedPct`/`AtkBuff` + `BuffSec`)，狀態存於 Player。
- `決策 7 — 動畫全在 client, 距離驅動`：server 不送動畫狀態；client 以
  `實際位移距離`推進 `animT` (速度快=步頻快, haste/狼追擊自動加速)，
  待機動畫用 `now + id 偏移` 錯開相位。受擊白閃靠 hit event 的目標 `id` +
  sprite 白色剪影 cache；武器揮舞是獨立 sprite 沿弧線旋轉，非身體幀。

- `決策 9 — 距離以人物單位 (unit) 標準化`：`game/map.go` 定義
  `Unit = TileSize` (1 unit = 一個人物寬 = 1 tile)。所有 gameplay 數值
  (速度/索敵/leash/觸距/範圍/對話距離) 一律以 unit 字面量宣告
  (如 `5 * Unit`、Item.Reach `1.5`)，px 僅為換算後的內部表示與渲染座標;
  wire 座標仍為 px (渲染層细節)。Item.Reach/Radius 走線即 unit,
  client 乘 `TILE` 還原。
- `決策 8 — 劇情資料驅動 + outbox`：主線八幕定義於 `story.go` 的 `Stages`
  (init 下發, client 只讀)；對話為 stage-switch 狀態機，動作 (`accept`/
  `turnin_*`/`craft_*`/`finale`) 一律驗證階段+距離+材料。World 對特定玩家的
  訊息 (橫幅/對話) 進 `outbox`，Hub 每次處理後 drain 轉發——World 保持不識
  連線。任務進度不另存欄位：collect 型直接以 `Inv` 計數呈現。

- `決策 13 — 快照差分 + client 預測`：廣播改送 delta (只含變動實體 +
  `rp`/`rm` 移除清單，每 40 ticks 一次 `key` 全量；新玩家入場強制 keyframe)。
  client 對自身跑`本地預測` (同一套碰撞/速度規則)，收到權威座標時
  差距 <3 tiles 平滑靠攏、超過則硬校正 (傳送)。他人與怪物仍走插值。
- `決策 14 — PvP 為雙方同意制`：兩邊都按 `P` 開啟且都在安全區外才會互相
  傷害 (傷害減半)；安全區內不得開啟，也不會被打到。

## 協定摘要 (Wire Protocol)

上行 `{t}`：`join{name}` / `in{up,dn,lf,rt}` / `atk` / `buy{id}` / `use{id}` /
`pvp` / `talk{id}` / `dlgact{id}`。
下行 `{t}`：`init{id,tile,w,h,rows,safe,shop,kinds,npcs,story}` /
`st{key,p,m,rp,rm,e}` (差分快照) / `msg{txt}` / `qmsg{txt}` (劇情橫幅) /
`dlg{npc,txt,acts}`。
玩家快照含 `iv` 消耗品/素材、`bs`/`ba` buff ticks、`q` 劇情階段、`pv` 決鬥模式。
怪物快照 `rg` = 狂暴中。
事件 `e[].k`：`sl` 揮擊、`hit` 傷害 (帶目標 id)、`die`、`gold`、`heal`、
`mat` 素材入包、`rare` 稀有掉落、`sum` Boss 召喚、`fw` 煙火、
`tel` 蓄力警告圈、`slam` 範圍爆發、`tp` 傳送、`rage` Boss 狂暴。
client 另有 dev 運鏡：console 設 `window.camOverride={x,y}` 觀察任意
區域 (純渲染, 截圖/除錯用)。

## 慣例 (Conventions)

- 數值平衡常數集中於 `game/player.go`、`game/monster.go`、`game/items.go` 頂部。
- client.js 依區塊註解分節 (net/sprites/tiles/input/shop/effects/loop)，不拆檔。
- 驗證：`go test ./...` (unit + ws integration)；視覺驗證用 headless Chrome CDP
  雙分頁腳本 (見 `docs/memory/2026-08-03-initial-build.md`)。
