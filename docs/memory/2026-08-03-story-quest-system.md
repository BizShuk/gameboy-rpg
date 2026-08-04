# 2026-08-03 — 主線劇情系統 (Story & Quest System)

## 做了什麼

寫下《綠泉鎮與月光水晶》(docs/story.md)，並沿故事把系統長全：

- 地圖 56x40 → 56x64：北之森 (暗地 `_`/暗草 `k`) + 月光神殿
  (石牆 `Z`/月光石 `q`/發光祭壇 `M`)；舊城鎮整體下移 24 列。
- 功能：NPC 系統 (村長/鐵匠 + `!` 指示)、Pokemon 風對話框 + 動作按鈕、
  八幕任務鏈 + 右上追蹤器 (collect 進度直接讀 Inv)、素材掉落、
  對話鍛造、雙 Boss (狼王 dash / 史萊姆王 summon)、Boss 頂部血條、
  劇情橫幅 qmsg、結局煙火。
- 裝備：素材 x3 + 鍛造裝 `shell_armor`/`fang_blade` + 結局 `moon_blade`。

## 架構決策

- 劇情資料驅動：Stages/NPCs/對話全在 `story.go`，init 下發 client 只讀。
- World→玩家訊息走 `outbox`，Hub drain 轉發；World 不識連線。
- 任務進度零新欄位：collect 型以 `Inv` 計數呈現，reach/boss 由 tick/擊殺鉤子推進。
- Boss 共鬥判定：擊殺者 + 320px 內同階段玩家一起過關 (多人友善)。

## 驗證

- `TestStoryFullPlaythrough`：Go 內完整走完 S0→S8 (接任務→交素材→鍛造→
  抵達→雙 Boss→結局獎勵+煙火)，另有防呆測試 (距離/材料/跳關) 與掉落/召喚測試。
- CDP 實測截圖：開場橫幅、對話框+接任務、追蹤器進度 1/5、素材實際掉落、
  神殿全景 (雙 Boss 同框+頂部血條)。

## 踩雷

- 「原點在地圖上方擴列」= 全部 Y 座標 +N：safe/spawn/生怪區/NPC/測試一起搬,
  測試先改先跑最快抓漏。
- headless 自動走位: boss aggro 範圍會覆蓋要路過的走廊, 單人必死;
  用雙分頁誘餌 (A 風箏 B 通過) 或接受死亡重生繼續。
- python CDP 腳本互相 import 必須 `if __name__ == "__main__"` guard (再犯)。
