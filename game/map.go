package game

// map.go — 地圖邏輯與碰撞查詢 (tile map, collision, safe zone)
//
// 地圖`資料`(mapRows / 層界 / Portals / 觸發區 / genSafes / genSpawnTile /
// DefaultSpawnAreas / genNPCTiles) 一律由 map_generator 生成於 map_gen.go,
// 本檔只保留型別與查詢邏輯。再生方式見 map_gen.go 檔頭。

import "fmt"

const (
	// TileSize 每格像素 (px per tile; 僅渲染層使用)
	TileSize = 16
	// TickRate 伺服器每秒模擬次數 (server ticks per second)
	TickRate = 20
	// Unit 距離基準單位: 1 unit = 一個人物寬 = 1 tile。
	// 所有 gameplay 數值 (速度/索敵/觸距/範圍) 一律以 unit 表達,
	// px 僅為換算後的內部表示與渲染座標。
	Unit = float64(TileSize)
)

// 圖塊字元 (tile chars):
//
//	走得過: '.' grass  ',' flower  'g' tall grass  'P' path  'p' plaza 石板
//	        'f' farm 農田  'b' bridge 木橋  '_' 森林暗地  'k' 森林暗草叢
//	        'q' 神殿地板  'd' 洞窟地  '^' 營火 (營地)  '<'/'>' 階梯
//	        'n' 星石地板  ':' 星光橋  '@' 傳送門
//	擋路:   'T' tree  'W' water  'y' water+lily  'F' fence  'H' wall
//	        'R' 紅頂  'U' 藍頂  'V' 綠頂  'D' door  'S' sign
//	        'C' 武器店櫃檯  'A' 道具店櫃檯  'O' well 水井  'L' lamp 路燈
//	        'B' bush 灌木  'x' crate 木箱  't' stump 樹樁  'r' rock 岩石
//	        'Z' 神殿石牆  'M' 月光水晶祭壇  'c' 洞窟壁  'l' 熔岩  'o' 火把
//	        'm' 隕鐵礦  'G' 深淵之門  'v' 虛空  '*' 星辰水晶  'E' 核心祭壇

// Rect tile 矩形 (inclusive)
type Rect struct{ X1, Y1, X2, Y2 int }

// TileMap 唯讀地圖
type TileMap struct {
	W, H int
	Rows []string
	// Safes 全部安全區 (怪物禁入 + 玩家回血)：綠泉鎮、地下層營地
	Safes []Rect
	// SpawnX/Y 玩家重生點 (px, 城鎮路口中心)
	SpawnX, SpawnY float64
}

// NewTileMap 以生成資料 (map_gen.go) 建立地圖；資料異常時 panic (啟動即失敗)
func NewTileMap() *TileMap {
	w := len(mapRows[0])
	for i, r := range mapRows {
		if len(r) != w {
			panic(fmt.Sprintf("map row %d width %d, want %d", i, len(r), w))
		}
	}
	return &TileMap{
		W:      w,
		H:      len(mapRows),
		Rows:   mapRows,
		Safes:  genSafes,
		SpawnX: float64(genSpawnTile[0] * TileSize),
		SpawnY: float64(genSpawnTile[1] * TileSize),
	}
}

// Portal 傳送點：踩上 From 即移動到 To；MinQuest > 0 表示需要劇情進度
type Portal struct {
	From     [2]int
	To       [2]int
	MinQuest int
	Deny     string // 進度不足時的提示
}

// InDungeon 是否位於地下層 (含更深層)
func (m *TileMap) InDungeon(py float64) bool { return int(py)/TileSize >= dungeonTopRow }

// InVoid 是否位於月之裏側
func (m *TileMap) InVoid(py float64) bool { return int(py)/TileSize >= voidTopRow }

// DungeonTopRow / VoidTopRow 對外暴露層界 (client init 用)
func (m *TileMap) DungeonTopRow() int { return dungeonTopRow }
func (m *TileMap) VoidTopRow() int    { return voidTopRow }

// InRect 像素座標是否位於 tile 矩形內
func InRect(r Rect, px, py float64) bool {
	tx, ty := int(px)/TileSize, int(py)/TileSize
	return tx >= r.X1 && tx <= r.X2 && ty >= r.Y1 && ty <= r.Y2
}

// At 取得圖塊字元；越界視為樹 (solid)
func (m *TileMap) At(tx, ty int) byte {
	if tx < 0 || ty < 0 || tx >= m.W || ty >= m.H {
		return 'T'
	}
	return m.Rows[ty][tx]
}

// Solid 圖塊是否阻擋移動
func (m *TileMap) Solid(tx, ty int) bool {
	switch m.At(tx, ty) {
	case 'T', 'W', 'y', 'F', 'H', 'R', 'U', 'V', 'D', 'C', 'A', 'S', 'O', 'L', 'B', 'x', 't', 'r', 'Z', 'M',
		'c', 'G', 'l', 'o', 'm', 'v', '*', 'E':
		return true
	}
	return false
}

// TallGrass 是否為草叢 (怪物生成點; 'g' 野區 / 'k' 森林)
func (m *TileMap) TallGrass(tx, ty int) bool {
	ch := m.At(tx, ty)
	return ch == 'g' || ch == 'k'
}

// InSafe 像素座標是否位於任一安全區
func (m *TileMap) InSafe(px, py float64) bool {
	for _, r := range m.Safes {
		if InRect(r, px, py) {
			return true
		}
	}
	return false
}

// BoxBlocked 檢查以 (cx,cy) 為中心、半寬 hw / 半高 hh 的 AABB 是否撞到 solid tile
func (m *TileMap) BoxBlocked(cx, cy, hw, hh float64) bool {
	x1, y1 := int(cx-hw)/TileSize, int(cy-hh)/TileSize
	x2, y2 := int(cx+hw)/TileSize, int(cy+hh)/TileSize
	for ty := y1; ty <= y2; ty++ {
		for tx := x1; tx <= x2; tx++ {
			if m.Solid(tx, ty) {
				return true
			}
		}
	}
	return false
}

// TilesOf 回傳指定字元的所有 tile 座標 (櫃檯定位用)
func (m *TileMap) TilesOf(ch byte) [][2]int {
	var out [][2]int
	for ty := 0; ty < m.H; ty++ {
		for tx := 0; tx < m.W; tx++ {
			if m.At(tx, ty) == ch {
				out = append(out, [2]int{tx, ty})
			}
		}
	}
	return out
}

// SpawnArea 怪物生成區
type SpawnArea struct {
	Region Rect   // tile 範圍
	Kind   string // 怪物種類 id
	Count  int    // 常駐數量上限
	Floor  byte   // 生成地面限制 (0 = 草叢 tallgrass)
}
