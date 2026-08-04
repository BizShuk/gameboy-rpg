# 2026-08-03 — 初版建置 (Initial Build)

## 做了什麼

從空目錄建出完整可玩的多人連線動作 RPG demo：Go server (gorilla/websocket,
20Hz authoritative tick) + vanilla JS canvas client (string-art pixel sprites,
零資產檔)，單 binary 內嵌靜態資源。城鎮安全區 + 四方野區 + 三種怪物 +
Poke Mart 商店 (3 武器/3 防具/藥水)。

## 決策與理由

- 地圖用 ASCII 常數陣列而非程式生成：可讀可改、啟動 panic + 測試守寬度，
  視覺對位問題靠截圖迭代。
- World 單 goroutine (Hub select 迴圈)：無鎖、慢客戶端丟幀。
- 不接 gosdk：demo 無持久設定，避免 API 對齊成本；列入 README.todo。

## 驗證方式 (可重用模式)

1. `go test ./...`：game unit tests + server httptest/ws integration test。
2. claude-in-chrome extension 未連線 → fallback 用 headless Chrome CDP：
   `--remote-debugging-port` + python websockets 直接打 CDP JSON，
   `PUT /json/new?url` 開雙分頁模擬兩玩家，`Runtime.evaluate` 操作
   client 全域 (keys/sendInput/openShop)，`Page.captureScreenshot` 截圖。
   client 加 `?name=` auto-join 讓自動化不需點 DOM。
   腳本存 scratchpad `cdp_drive.py` / `cdp_scout.py` (throwaway)。
3. 踩雷：canvas `fillText` 畫 emoji 在 headless 缺字型 → HUD 全改 ASCII;
   DOM emoji (含 VS16) 則正常。相鄰怪物會被範圍揮擊一起打死 →
   測試斷言不可假設單殺。

## 平衡數值快照

玩家 HP60/ATK4/80px·s；slime 12HP·3dmg、beetle 26HP·6dmg、wolf 42HP·10dmg·88 速
(略快於玩家)；起始金 30 剛好買 wood_sword(20) 或 cloth_armor(15)+potion(10)。
