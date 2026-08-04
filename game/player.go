package game

// player.go — 玩家實體：屬性、輸入、移動、buff (player entity)

const (
	playerMaxHP    = 60
	playerBaseAtk  = 4
	playerSpeed    = 5.0 * Unit  // 每秒 5 人物單位
	playerHalfW    = 0.31 * Unit // 碰撞半寬 (約 1/3 人物)
	playerHalfH    = 0.31 * Unit
	playerRespawn  = 60 // ticks (3s)
	startGold      = 30
	maxPerItem     = 9 // 單一消耗品持有上限
	safeRegenEvery = 8 // ticks (0.4s)
	safeRegenHP    = 3
)

// Input 方向鍵狀態 (client 每次變更時上報)
type Input struct {
	Up, Down, Left, Right bool
}

// Player 玩家
type Player struct {
	ID     int64
	Name   string
	X, Y   float64 // 中心 px
	Dir    byte    // 'u' 'd' 'l' 'r'
	HP     int
	Gold   int
	Weapon string         // item id, "" = 徒手
	Armor  string         // item id, "" = 無
	Inv    map[string]int // 消耗品與素材數量 (item id -> count)
	Quest  int            // 主線劇情階段 (story.go Stages)
	PvP    bool           // 野區決鬥開關 (雙方皆開才會互相傷害)

	wasSafe bool // 上一 tick 是否在安全區 (進入時觸發存檔)

	in           Input
	atkCD        int
	respawnTicks int // >0 表示死亡等待重生
	speedTicks   int // 加速 buff 剩餘 ticks
	speedPct     int
	atkTicks     int // 攻擊 buff 剩餘 ticks
	atkBonus     int
}

// NewPlayer 於重生點建立玩家
func NewPlayer(id int64, name string, m *TileMap) *Player {
	return &Player{
		ID: id, Name: name,
		X: m.SpawnX, Y: m.SpawnY,
		Dir: 'd', HP: playerMaxHP, Gold: startGold,
		Inv: map[string]int{},
	}
}

// Atk 目前攻擊力 (基礎 + 武器 + buff)
func (p *Player) Atk() int {
	a := playerBaseAtk
	if it := ItemByID(p.Weapon); it != nil {
		a += it.Atk
	}
	if p.atkTicks > 0 {
		a += p.atkBonus
	}
	return a
}

// Def 目前防禦力 (防具)
func (p *Player) Def() int {
	if it := ItemByID(p.Armor); it != nil {
		return it.Def
	}
	return 0
}

// Speed 目前移速 px/s (加速 buff)
func (p *Player) Speed() float64 {
	s := playerSpeed
	if p.speedTicks > 0 {
		s *= 1 + float64(p.speedPct)/100
	}
	return s
}

// AtkParams 目前武器攻擊參數：冷卻/觸點距離/判定半徑
// (Item 內以人物單位表達, 此處換算為內部 px)
func (p *Player) AtkParams() (cd int, reach, radius float64) {
	cd, reachU, radiusU := FistCD, float64(FistReach), float64(FistRadius)
	if it := ItemByID(p.Weapon); it != nil {
		if it.CD > 0 {
			cd = it.CD
		}
		if it.Reach > 0 {
			reachU = it.Reach
		}
		if it.Radius > 0 {
			radiusU = it.Radius
		}
	}
	return cd, reachU * Unit, radiusU * Unit
}

// Dead 是否死亡中
func (p *Player) Dead() bool { return p.respawnTicks > 0 }

// SetInput 更新輸入狀態
func (p *Player) SetInput(in Input) { p.in = in }

// step 每 tick 移動與冷卻 (由 World.Tick 呼叫)
func (p *Player) step(m *TileMap) {
	if p.atkCD > 0 {
		p.atkCD--
	}
	if p.speedTicks > 0 {
		p.speedTicks--
	}
	if p.atkTicks > 0 {
		p.atkTicks--
	}
	if p.Dead() {
		p.respawnTicks--
		if p.respawnTicks == 0 {
			p.X, p.Y = m.SpawnX, m.SpawnY
			p.HP = playerMaxHP
		}
		return
	}
	dx, dy := 0.0, 0.0
	if p.in.Up {
		dy--
	}
	if p.in.Down {
		dy++
	}
	if p.in.Left {
		dx--
	}
	if p.in.Right {
		dx++
	}
	if dx == 0 && dy == 0 {
		return
	}
	// 斜向等速 (normalize)
	if dx != 0 && dy != 0 {
		dx *= 0.7071
		dy *= 0.7071
	}
	step := p.Speed() / TickRate
	moveWithCollision(m, &p.X, &p.Y, dx*step, dy*step, playerHalfW, playerHalfH)
	switch {
	case dy < 0 && dx == 0:
		p.Dir = 'u'
	case dy > 0 && dx == 0:
		p.Dir = 'd'
	case dx < 0:
		p.Dir = 'l'
	case dx > 0:
		p.Dir = 'r'
	}
}

// moveWithCollision 分軸位移，撞牆則該軸取消
func moveWithCollision(m *TileMap, x, y *float64, dx, dy, hw, hh float64) {
	if dx != 0 && !m.BoxBlocked(*x+dx, *y, hw, hh) {
		*x += dx
	}
	if dy != 0 && !m.BoxBlocked(*x, *y+dy, hw, hh) {
		*y += dy
	}
}

// dirVec 面向單位向量
func dirVec(d byte) (float64, float64) {
	switch d {
	case 'u':
		return 0, -1
	case 'd':
		return 0, 1
	case 'l':
		return -1, 0
	}
	return 1, 0
}
