# 2026-08-03 — 距離標準化 + 第二章《星墜之淵》

## 做了什麼

- `unit 標準化`：`Unit = TileSize` (1 unit = 一個人物)。所有 gameplay 數值
  改以 unit 字面量宣告 (`Speed: 5.5 * Unit`、`Item.Reach: 1.5`)；
  wire 的 Item.Reach/Radius 即 unit, client 乘 TILE 還原。內部 px 值
  幾乎不變 (1.5u = 24px), 測試無感遷移。
- `第二章`：地圖再擴 24 列洞窟 (56x88)。神殿階梯 `>` ↔ 地下層 `<` 傳送、
  黑暗光照系統 (destination-out 打洞: 玩家/火把/熔岩/礦石光源, 火光搖曳)、
  新怪幽影 (半透明漂浮)/石像鬼 (振翅)/暗月魔像 (核心脈動 + slam 震地波:
  tel 警告圈 1s → 半徑 3u 傷害)、隕鐵素材 → 星隕劍 (星屑粒子) + 月光護甲。
  劇情 S8-S13, E2E 測試走到雙章全通。

## 踩雷 (CDP 自動化)

- `ME` 表達式用 `find(p=>p.id===myId)` 在`背景分頁`永遠 undefined ——
  `ent.id` 是渲染迴圈賦值, 背景分頁不跑 rAF。改 `players.get(myId)` (Map key)。
- 廣場`路燈` (r16/r40 的 L) 是自動走位慣性殺手, 橫向移動一律走大路 rows 43-44。
- Boss aggro 覆蓋必經走廊時單人必死：雙分頁誘餌可行但受野怪隨機性干擾;
  最終解是 client `window.camOverride` dev 運鏡 (純渲染) 拍真實世界任意區域,
  不影響 gameplay, 截圖/飛越 GIF 神器。

## 平衡備註

第二章數值: shade 30HP/8dmg/3.4u, gargoyle 60HP/14dmg/4.5u,
golem 550HP/20dmg/slam 3u。單人建議 Flame Blade + Iron Armor 以上再下去。
