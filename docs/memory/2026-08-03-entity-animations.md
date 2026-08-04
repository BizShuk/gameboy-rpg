# 2026-08-03 — 角色與怪物動畫 (Entity Animations)

## 做了什麼 (全部 client-side, server 只加 hit event 目標 id)

- 主角：4 相步態 (walk0/stand/walk1/stand, 位移距離驅動)、待機眨眼
  (3.4s 週期, id 錯開相位)、攻擊突進 2.5px、死亡倒地旋轉 tween。
- 怪物：slime 跳躍前進 (sin 弧 + 落地壓扁幀) 與待機呼吸、beetle 觸鬚
  抽動幀、wolf 待機起伏；陰影隨跳躍高度縮放。
- 武器揮舞：7 把武器各有 pixel sprite，揮擊時沿面向弧線旋轉掃過
  (斧/火焰劍弧度更大)，殘影 trail 弧墊底；面向上時武器繪於身體後。
- 受擊白閃：sprite 白色剪影 (source-in composite) WeakMap cache。
- 重生/入場縮放 pop、死亡 poof 依種類配色、草叢移動揚葉粒子。

## 關鍵手法

- `animT += 實際位移` 取代固定幀率：步頻自然隨移速縮放 (haste、狼衝刺)。
- join 當下已存在的實體不播 spawn pop (firstStateDone flag)。
- 揮擊計時統一在 drawEntity 頂部以 frameDt 遞減，武器/trail/突進共用。

## 驗證

- go test 全綠、node --check 過。CDP screencast (everyNthFrame=2) 收 500+ 幀
  → PIL 組 GIF：勝利版 (擊殺 poof+金幣+撤退回血) 與死亡版 (圍攻→倒地→重生)。
  特寫截圖確認白閃剪影、武器 sprite、slime 跳躍幀。

## 踩雷

- import 另一個 CDP 腳本時 module 層級的 asyncio.run 會整段重跑 →
  一律加 `if __name__ == "__main__"` guard。
- 路線經過 (13,21) 的路燈 tile 會卡住 demo 走位；自動化走位要沿大路 rows 19-20。
