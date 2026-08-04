# 2026-08-03 — 地圖精緻化與道具擴充 (Map Refine + Item Variety)

## 做了什麼

- 地圖 48x36 → 56x40：石板廣場 (`p`) + 水井 (`O`) + 8 座路燈 (`L`)、
  紅頂武器店/藍頂道具店 (遮陽棚配色區分)、綠頂民宅、農田 (`f`)、
  蓮花池 (`y`) + 可走木橋 (`b`)、灌木/木箱/樹樁/岩石裝飾。
- 道具 7→16：武器 7 把以 `CD/Reach/Radius` 差異化 (匕首快、長槍遠、斧頭寬)；
  防具 5 階 (`DEF +1~+10`)；消耗品 4 種 (回血/全滿/加速 buff/加攻 buff)。
- 商店拆兩間：`C` 櫃檯賣武器、`A` 櫃檯賣防具+消耗品，Buy 驗證店別。
- client：12 種新 tile renderer、雙商店 UI、熱鍵 1-4、buff 倒數 HUD、
  揮擊特效顏色/弧度依武器。

## 決策與理由

- 怪物種類維持 3 種：需求聚焦地圖與道具；新怪列 backlog。
- 消耗品 buff 存 Player (`ticks` 倒數)，不做通用 buff 系統 —— 兩種夠用。
- 熱鍵 1-4 依 shop 清單順序取 kind=potion，client 不寫死 id。

## 驗證

- go test 全綠 (新增: 分店拒賣、武器 CD/Reach、藥水/兩種 buff 生效+過期、橋可走)。
- CDP headless 實測：雙櫃檯辨識、買 wood_sword+potion (gold 30→0)、
  `iv` 同步、四張截圖確認廣場/兩店/橋池全部渲染正確、無 JS error。

## 踩雷

- ASCII 地圖擴寬時，所有既有座標假設 (spawn/counter/test bait 位置) 都要跟著搬 ——
  測試先行 (先改測試座標再跑) 可以一次抓出全部遺漏。
