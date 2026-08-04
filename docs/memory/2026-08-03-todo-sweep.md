# 2026-08-03 — README.todo 全數清空 (13 項)

## 完成項目與做法

| 項目 | 做法 |
| ---- | ---- |
| 營地機能 | 安全區`進入瞬間`存檔 + 提示 (wasSafe 邊緣觸發)；營地/裏側平台放 `A` 櫃檯直接複用道具店 |
| 同名同時上線 | `World.uniqueName` 自動加序號 (`Ash-2`)，離線後可復用；存檔以名稱為 key 故不互蓋 |
| 第三章平衡 | 裏側中繼安全平台 + 幽影/石像鬼索敵下修 (前一輪) |
| 通關後內容 | Boss 重打金幣加倍 (`Quest >= len(Stages)-1`)；稀有掉落 |
| 稀有裝備 | `MonsterKind.RareID/RarePct`；`更優才自動裝上`，較差只提示 |
| gosdk | `config.Default(WithAppName)` + viper；flag > APP_* env > yaml > 預設 |
| pm2 | `run.sh` (建目錄+build+exec) + `ecosystem.config.js` (Go 版 pm2: 路徑字面值/args []string) |
| client 預測 | 本地重跑移動規則, `reconcile` 小誤差插值大誤差硬校正；實測按鍵 35ms 內反應 |
| PvP | 雙方同意制 (都按 P + 都在安全區外), 傷害減半, 安全區免疫 |
| 觸控 | pointer events 虛擬搖桿 (死區 0.32) + 攻擊長按連發 |
| delta 快照 | 只送變動實體 + `rp/rm` 移除清單, 每 40 ticks keyframe；`實測省 52%` |
| 音量 UI | 滑桿 + M 鍵, localStorage 持久化 |
| 第二張地圖 | 判定為已達成 (三層地圖 + 傳送門), 標記關閉 |

## 踩雷

- `PlayerState` 含 map 欄位 → Go `==` 在`型別層級`就禁止 (即使把欄位設 nil
  也不能比)，delta 差分必須逐欄比對 + `maps.Equal`。
- delta 追蹤表要 `maps.Clone(Iv)`：World 會就地改動同一個 map，不複製會導致
  「背包變了卻比對相同」而漏送。
- client 預測初始化順序：`reconcile` 可能早於第一次 `predictSelf`，
  `undefined` 參與運算會讓座標變 `NaN` 且畫面靜止；用 `Number.isFinite` 守。
- 整合測試若假設「每幀全量」，改 delta 後會 nil panic；測試改成`模擬 client
  本地表`反而順便驗證了差分協定。
