package game

// monster.go — 怪物實體與 AI (wander / chase / attack / leash / boss special)

import "math"

// MonsterKind 怪物種類數值模板
type MonsterKind struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	MaxHP   int     `json:"maxHp"`
	Dmg     int     `json:"dmg"`
	Boss    bool    `json:"boss,omitempty"`
	Speed   float64 `json:"-"` // px/s
	Aggro   float64 `json:"-"` // 索敵半徑 px
	GoldMin int     `json:"-"`
	GoldMax int     `json:"-"`
	Leash   float64 `json:"-"` // 離家上限 px
	Respawn int     `json:"-"` // 重生 ticks
	DropID  string  `json:"-"` // 掉落素材 item id
	DropPct int     `json:"-"` // 掉落率 %
	RareID  string  `json:"-"` // 稀有裝備掉落 (非商店取得)
	RarePct int     `json:"-"` // 稀有掉落率 %
	Special string  `json:"-"` // "" | "dash" | "summon" | "slam" | "nova"
}

// Kinds 一般怪 + 劇情 Boss。Speed/Aggro/Leash 以人物單位 (unit) 表達,
// 宣告時即換算為內部 px。
var Kinds = map[string]MonsterKind{
	"slime": {ID: "slime", Name: "Slime", MaxHP: 12, Dmg: 3, Speed: 2 * Unit, Aggro: 4 * Unit,
		GoldMin: 2, GoldMax: 5, Leash: 8 * Unit, Respawn: 200, DropID: "slime_gel", DropPct: 100},
	"beetle": {ID: "beetle", Name: "Beetle", MaxHP: 26, Dmg: 6, Speed: 3 * Unit, Aggro: 5.5 * Unit,
		GoldMin: 5, GoldMax: 9, Leash: 8 * Unit, Respawn: 200, DropID: "beetle_shell", DropPct: 80},
	"wolf": {ID: "wolf", Name: "Wolf", MaxHP: 42, Dmg: 10, Speed: 5.5 * Unit, Aggro: 8 * Unit,
		GoldMin: 12, GoldMax: 20, Leash: 8 * Unit, Respawn: 200, DropID: "wolf_fang", DropPct: 70,
		RareID: "hunters_bow", RarePct: 4},
	"wolf_king": {ID: "wolf_king", Name: "月蝕狼王", MaxHP: 220, Dmg: 16, Boss: true,
		Speed: 5.6 * Unit, Aggro: 10 * Unit, GoldMin: 80, GoldMax: 120, Leash: 16 * Unit, Respawn: 1200,
		DropID: "wolf_fang", DropPct: 100, Special: "dash"},
	// 史萊姆王守祭壇: 索敵短, 讓走側廊去階梯的玩家有路可繞
	"slime_king": {ID: "slime_king", Name: "暗影史萊姆王", MaxHP: 420, Dmg: 13, Boss: true,
		Speed: 2.6 * Unit, Aggro: 7 * Unit, GoldMin: 200, GoldMax: 300, Leash: 10 * Unit, Respawn: 1500,
		Special: "summon"},
	// 第二章: 神殿地下層 (索敵較短 — 黑暗中靠近才被發現)
	"shade": {ID: "shade", Name: "幽影", MaxHP: 30, Dmg: 7, Speed: 3.4 * Unit, Aggro: 5.5 * Unit,
		GoldMin: 8, GoldMax: 14, Leash: 9 * Unit, Respawn: 240, DropID: "meteor_shard", DropPct: 65},
	"gargoyle": {ID: "gargoyle", Name: "石像鬼", MaxHP: 60, Dmg: 12, Speed: 4.5 * Unit, Aggro: 5.5 * Unit,
		GoldMin: 18, GoldMax: 30, Leash: 9 * Unit, Respawn: 300, DropID: "meteor_shard", DropPct: 45,
		RareID: "stone_plate", RarePct: 6},
	"eclipse_golem": {ID: "eclipse_golem", Name: "暗月魔像", MaxHP: 550, Dmg: 20, Boss: true,
		Speed: 2.8 * Unit, Aggro: 12 * Unit, GoldMin: 300, GoldMax: 400, Leash: 18 * Unit, Respawn: 1500,
		Special: "slam"},
	// 第三章: 月之裏側
	"wraith": {ID: "wraith", Name: "月靈", MaxHP: 45, Dmg: 11, Speed: 4.2 * Unit, Aggro: 6 * Unit,
		GoldMin: 20, GoldMax: 34, Leash: 10 * Unit, Respawn: 260, DropID: "void_crystal", DropPct: 55},
	"sentinel": {ID: "sentinel", Name: "星衛", MaxHP: 95, Dmg: 16, Speed: 3.6 * Unit, Aggro: 6 * Unit,
		GoldMin: 35, GoldMax: 55, Leash: 10 * Unit, Respawn: 320, DropID: "void_crystal", DropPct: 45,
		RareID: "starlight_lance", RarePct: 7},
	"eclipse_core": {ID: "eclipse_core", Name: "月蝕根源", MaxHP: 900, Dmg: 24, Boss: true,
		Speed: 3.0 * Unit, Aggro: 13 * Unit, GoldMin: 500, GoldMax: 700, Leash: 20 * Unit, Respawn: 1800,
		RareID: "eclipse_crown", RarePct: 100, Special: "nova"},
}

const (
	monsterHalf     = 0.3 * Unit // 碰撞半寬
	monsterAtkRange = 1.0 * Unit // 近戰觸及
	monsterAtkCD    = 14         // ticks (0.7s)
	slamRadius      = 3.0 * Unit // 魔像震地波半徑
	slamCharge      = 25         // 蓄力 ticks (1.25s, 留走位反應時間)
	novaRadius      = 4.5 * Unit // 月蝕根源星爆半徑
	novaCharge      = 30         // 蓄力 ticks (1.5s)
	enrageAtPct     = 50         // HP 低於此百分比進入狂暴
)

// Monster 怪物實體
type Monster struct {
	ID           int64
	Kind         string
	X, Y         float64
	HomeX, HomeY float64
	HP           int
	Dir          byte
	TargetID     int64 // 追擊中的玩家 id, 0 = 無
	NoRespawn    bool  // 召喚物死亡不重生

	atkCD       int
	wanderTicks int
	wdx, wdy    float64
	specialCD   int // boss 技能冷卻
	dashTicks   int // 衝刺剩餘 ticks
	slamTicks   int // 震地/星爆蓄力剩餘 ticks
	slamR       float64
	enraged     bool // 已進入狂暴階段
}

// Enraged 是否狂暴中 (client 依此變色)
func (mo *Monster) Enraged() bool { return mo.enraged }

// step 單隻怪物 AI
func (mo *Monster) step(w *World) {
	k := Kinds[mo.Kind]
	if mo.atkCD > 0 {
		mo.atkCD--
	}
	if mo.specialCD > 0 {
		mo.specialCD--
	}
	// 狂暴: 血量過半後速度與技能頻率提升 (一次性宣告)
	if !mo.enraged && k.Boss && k.Special == "nova" && mo.HP*100 < k.MaxHP*enrageAtPct {
		mo.enraged = true
		w.events = append(w.events, Event{K: "rage", ID: mo.ID, X: int(mo.X), Y: int(mo.Y)})
		w.bossBanner("月蝕根源發出刺耳嘶鳴——它變快了!")
	}
	if mo.slamTicks > 0 { // 蓄力中: 定身, 倒數結束引爆
		mo.slamTicks--
		if mo.slamTicks == 0 {
			w.bossBlast(mo, mo.slamR)
		}
		return
	}

	// 1. 選定/維持目標：最近且不在安全區的活玩家
	var target *Player
	if mo.TargetID != 0 {
		if p, ok := w.players[mo.TargetID]; ok && !p.Dead() && !w.Map.InSafe(p.X, p.Y) &&
			dist(mo.X, mo.Y, p.X, p.Y) < k.Aggro*1.6 && dist(mo.HomeX, mo.HomeY, p.X, p.Y) < k.Leash*1.5 {
			target = p
		} else {
			mo.TargetID = 0
		}
	}
	if target == nil {
		best := k.Aggro
		for _, p := range w.players {
			if p.Dead() || w.Map.InSafe(p.X, p.Y) {
				continue
			}
			if d := dist(mo.X, mo.Y, p.X, p.Y); d < best {
				best, target = d, p
			}
		}
		if target != nil {
			mo.TargetID = target.ID
		}
	}

	step := k.Speed / TickRate
	if mo.enraged {
		step *= 1.5
	}
	if mo.dashTicks > 0 { // 狼王衝刺
		mo.dashTicks--
		step *= 2.6
	}

	// 2. 追擊 / 施放技能 / 攻擊
	if target != nil {
		d := dist(mo.X, mo.Y, target.X, target.Y)
		switch k.Special {
		case "dash":
			if mo.specialCD == 0 && d > 2*Unit && d < 9*Unit {
				mo.specialCD = 120 // 6s
				mo.dashTicks = 20
			}
		case "summon":
			if mo.specialCD == 0 {
				mo.specialCD = 260 // 13s
				w.summonMinions(mo)
			}
		case "slam":
			if mo.specialCD == 0 && d < 2.5*Unit {
				mo.specialCD = 200 // 10s
				mo.slamTicks, mo.slamR = slamCharge, slamRadius
				w.events = append(w.events, Event{K: "tel", X: int(mo.X), Y: int(mo.Y), V: int(slamRadius)})
				return
			}
		case "nova": // 星爆: 遠距也放; 狂暴後冷卻減半並附帶召喚月靈
			if mo.specialCD == 0 && d < 8*Unit {
				mo.specialCD = 160 // 8s
				if mo.enraged {
					mo.specialCD = 80
					w.summonKind(mo, "wraith", 2)
				}
				mo.slamTicks, mo.slamR = novaCharge, novaRadius
				w.events = append(w.events, Event{K: "tel", X: int(mo.X), Y: int(mo.Y), V: int(novaRadius)})
				return
			}
		}
		if d < monsterAtkRange {
			if mo.atkCD == 0 {
				mo.atkCD = monsterAtkCD
				w.monsterHit(mo, target)
			}
			return
		}
		mo.moveToward(w, target.X, target.Y, step)
		return
	}

	// 3. 無目標：離家太遠先回家，否則隨機漫遊
	if dist(mo.X, mo.Y, mo.HomeX, mo.HomeY) > k.Leash {
		mo.moveToward(w, mo.HomeX, mo.HomeY, step)
		return
	}
	if mo.wanderTicks <= 0 {
		mo.wanderTicks = 40 + w.rng.IntN(60) // 2-5s
		switch w.rng.IntN(4) {
		case 0:
			mo.wdx, mo.wdy = 0, 0 // 停留
		case 1:
			mo.wdx, mo.wdy = 1-2*w.rng.Float64(), 0
		case 2:
			mo.wdx, mo.wdy = 0, 1-2*w.rng.Float64()
		case 3:
			mo.wdx, mo.wdy = 1-2*w.rng.Float64(), 1-2*w.rng.Float64()
		}
	}
	mo.wanderTicks--
	if mo.wdx != 0 || mo.wdy != 0 {
		mo.moveBy(w, mo.wdx*step*0.5, mo.wdy*step*0.5)
	}
}

// moveToward 朝目標點位移 (不進安全區、不穿牆)
func (mo *Monster) moveToward(w *World, tx, ty, step float64) {
	dx, dy := tx-mo.X, ty-mo.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return
	}
	mo.moveBy(w, dx/d*step, dy/d*step)
}

// moveBy 位移 + 邊界規則：怪物永不踏入安全區
func (mo *Monster) moveBy(w *World, dx, dy float64) {
	nx, ny := mo.X+dx, mo.Y+dy
	if dx != 0 && !w.Map.BoxBlocked(nx, mo.Y, monsterHalf, monsterHalf) && !w.Map.InSafe(nx, mo.Y) {
		mo.X = nx
	}
	if dy != 0 && !w.Map.BoxBlocked(mo.X, ny, monsterHalf, monsterHalf) && !w.Map.InSafe(mo.X, ny) {
		mo.Y = ny
	}
	if math.Abs(dx) > math.Abs(dy) {
		if dx < 0 {
			mo.Dir = 'l'
		} else if dx > 0 {
			mo.Dir = 'r'
		}
	} else if dy < 0 {
		mo.Dir = 'u'
	} else if dy > 0 {
		mo.Dir = 'd'
	}
}

func dist(x1, y1, x2, y2 float64) float64 { return math.Hypot(x2-x1, y2-y1) }
