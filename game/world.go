package game

// world.go — 世界狀態機：tick 迴圈、戰鬥判定、重生、快照 (authoritative state)

import (
	"fmt"
	"math/rand/v2"
)

// Event 單 tick 內發生的視覺事件 (client 播特效用)
type Event struct {
	K  string `json:"k"`            // sl=slash hit=damage die=death gold=gold gain heal=治療
	ID int64  `json:"id,omitempty"` // sl/gold/heal: 相關玩家
	X  int    `json:"x,omitempty"`
	Y  int    `json:"y,omitempty"`
	V  int    `json:"v,omitempty"` // 傷害值/金額
	D  string `json:"d,omitempty"` // sl: 面向
	S  string `json:"s,omitempty"` // die: 怪物種類
}

// respawnJob 怪物重生排程
type respawnJob struct {
	kind         string
	homeX, homeY float64
	ticks        int
}

// counterSet 一種商店的櫃檯位置集合
type counterSet struct {
	store string
	tiles [][2]int
}

// PlayerMsg 世界產生的 per-player 訊息 (Hub 於每次處理後轉發)
type PlayerMsg struct {
	PID  int64
	Kind string // "msg" | "qmsg" | "dlg"
	Txt  string
	Dlg  *Dlg
}

// World 遊戲世界；僅由 Hub 單一 goroutine 存取，不加鎖
type World struct {
	Map      *TileMap
	players  map[int64]*Player
	monsters map[int64]*Monster
	respawns []respawnJob
	events   []Event
	nextID   int64
	tick     int64
	rng      *rand.Rand
	counters []counterSet
	outbox   []PlayerMsg
	store    Store // 進度持久化 (nil = 不存檔)
}

// queueMsg 排入 per-player 訊息
func (w *World) queueMsg(pid int64, kind, txt string) {
	w.outbox = append(w.outbox, PlayerMsg{PID: pid, Kind: kind, Txt: txt})
}

// PopOutbox 取走所有待送訊息 (Hub 呼叫)
func (w *World) PopOutbox() []PlayerMsg {
	out := w.outbox
	w.outbox = nil
	return out
}

// NewWorld 建立世界並鋪滿初始怪物
func NewWorld() *World {
	m := NewTileMap()
	w := &World{
		Map:      m,
		players:  map[int64]*Player{},
		monsters: map[int64]*Monster{},
		rng:      rand.New(rand.NewPCG(20260803, 1)),
		counters: []counterSet{
			{store: StoreWeapon, tiles: m.TilesOf('C')},
			{store: StoreGear, tiles: m.TilesOf('A')},
		},
	}
	for _, area := range DefaultSpawnAreas() {
		for range area.Count {
			w.spawnMonster(area)
		}
	}
	return w
}

// spawnMonster 在區域內隨機生成 (預設限草叢; area.Floor 可指定地面)
func (w *World) spawnMonster(area SpawnArea) {
	for range 200 {
		tx := area.Region.X1 + w.rng.IntN(area.Region.X2-area.Region.X1+1)
		ty := area.Region.Y1 + w.rng.IntN(area.Region.Y2-area.Region.Y1+1)
		if area.Floor == 0 && !w.Map.TallGrass(tx, ty) {
			continue
		}
		if area.Floor != 0 && w.Map.At(tx, ty) != area.Floor {
			continue
		}
		px, py := float64(tx*TileSize+TileSize/2), float64(ty*TileSize+TileSize/2)
		// 安全區禁止生怪 (生怪區與營地/城鎮重疊時跳過該格)
		if w.Map.InSafe(px, py) {
			continue
		}
		w.nextID++
		w.monsters[w.nextID] = &Monster{
			ID: w.nextID, Kind: area.Kind,
			X: px, Y: py, HomeX: px, HomeY: py,
			HP: Kinds[area.Kind].MaxHP, Dir: 'd',
		}
		return
	}
}

// summonMinions 暗影史萊姆王召喚小史萊姆 (不重生)
func (w *World) summonMinions(boss *Monster) { w.summonKind(boss, "slime", 2) }

// summonKind Boss 召喚指定種類的隨從 (不重生)
func (w *World) summonKind(boss *Monster, kind string, n int) {
	for i := range n {
		off := (1.1 + 0.6*float64(i)) * Unit
		x, y := boss.X+off*float64(1-2*(i%2)), boss.Y+0.6*Unit
		if w.Map.BoxBlocked(x, y, monsterHalf, monsterHalf) {
			continue
		}
		w.nextID++
		w.monsters[w.nextID] = &Monster{
			ID: w.nextID, Kind: kind, NoRespawn: true,
			X: x, Y: y, HomeX: x, HomeY: y,
			HP: Kinds[kind].MaxHP, Dir: 'd', TargetID: boss.TargetID,
		}
	}
	w.events = append(w.events, Event{K: "sum", X: int(boss.X), Y: int(boss.Y)})
}

// rareDrop 稀有裝備掉落：優於現有裝備才自動裝上，否則只提示
func (w *World) rareDrop(mo *Monster, killer *Player) {
	k := Kinds[mo.Kind]
	if k.RareID == "" || w.rng.IntN(100) >= k.RarePct {
		return
	}
	it := ItemByID(k.RareID)
	if it == nil {
		return
	}
	better := false
	switch it.Kind {
	case KindWeapon:
		cur := ItemByID(killer.Weapon)
		if cur == nil || it.Atk > cur.Atk {
			killer.Weapon = it.ID
			better = true
		}
	case KindArmor:
		cur := ItemByID(killer.Armor)
		if cur == nil || it.Def > cur.Def {
			killer.Armor = it.ID
			better = true
		}
	}
	w.events = append(w.events, Event{K: "rare", ID: killer.ID, S: it.ID, X: int(mo.X), Y: int(mo.Y - 34)})
	if better {
		w.queueMsg(killer.ID, "qmsg", "稀有掉落! 裝備了「"+it.Name+"」")
	} else {
		w.queueMsg(killer.ID, "msg", "稀有掉落「"+it.Name+"」——但你身上的更好")
	}
}

// bossBanner 對所有玩家送出 Boss 戰橫幅
func (w *World) bossBanner(txt string) {
	for _, p := range w.players {
		w.queueMsg(p.ID, "qmsg", txt)
	}
}

// nameOnline 該名稱是否已在線上
func (w *World) nameOnline(name string) bool {
	for _, p := range w.players {
		if p.Name == name {
			return true
		}
	}
	return false
}

// uniqueName 同名同時上線時自動加序號，避免兩人共用同一份存檔
func (w *World) uniqueName(name string) string {
	if !w.nameOnline(name) {
		return name
	}
	for i := 2; i < 100; i++ {
		alt := fmt.Sprintf("%s-%d", name, i)
		if !w.nameOnline(alt) {
			return alt
		}
	}
	return name
}

// AddPlayer 加入玩家；同名有存檔則續玩，否則走開場劇情
func (w *World) AddPlayer(name string) *Player {
	w.nextID++
	orig := name
	name = w.uniqueName(name)
	p := NewPlayer(w.nextID, name, w.Map)
	w.players[p.ID] = p
	if name != orig {
		w.queueMsg(p.ID, "msg", "「"+orig+"」已在線上, 你的名字改為「"+name+"」(存檔分開計算)")
	}
	if w.store != nil {
		if pr, ok := w.store.Load(name); ok {
			applyProgress(p, pr)
			w.queueMsg(p.ID, "qmsg", "歡迎回來, "+name+"! 進度已復原")
			if p.Quest < len(Stages) {
				w.queueMsg(p.ID, "msg", "目前任務: "+Stages[p.Quest].Obj)
			}
			return p
		}
	}
	w.queueMsg(p.ID, "qmsg", "綠泉鎮的結界正在衰弱——找廣場上的村長羅文談談 (靠近按 E)")
	return p
}

// RemovePlayer 移除玩家 (斷線)
func (w *World) RemovePlayer(id int64) { delete(w.players, id) }

// PlayerCount 目前在線人數
func (w *World) PlayerCount() int { return len(w.players) }

// SetInput 設定玩家輸入
func (w *World) SetInput(id int64, in Input) {
	if p, ok := w.players[id]; ok {
		p.SetInput(in)
	}
}

// Attack 玩家出手：對面向前方範圍內所有怪物造成傷害 (參數依武器)
func (w *World) Attack(id int64) {
	p, ok := w.players[id]
	if !ok || p.Dead() || p.atkCD > 0 {
		return
	}
	cd, reach, radius := p.AtkParams()
	p.atkCD = cd
	dx, dy := dirVec(p.Dir)
	hx, hy := p.X+dx*reach, p.Y+dy*reach
	w.events = append(w.events, Event{K: "sl", ID: p.ID, D: string(p.Dir)})
	for _, mo := range w.monsters {
		if dist(hx, hy, mo.X, mo.Y) > radius {
			continue
		}
		dmg := max(1, p.Atk()+w.rng.IntN(3)-1)
		mo.HP -= dmg
		mo.TargetID = p.ID // 反擊仇恨
		w.events = append(w.events, Event{K: "hit", ID: mo.ID, X: int(mo.X), Y: int(mo.Y - 10), V: dmg})
		if mo.HP <= 0 {
			w.killMonster(mo, p)
		}
	}
	w.pvpHits(p, hx, hy, radius)
}

// pvpHits 野區決鬥: 雙方都開 PvP 且都在安全區外才會互相造成傷害
func (w *World) pvpHits(p *Player, hx, hy, radius float64) {
	if !p.PvP || w.Map.InSafe(p.X, p.Y) {
		return
	}
	for _, t := range w.players {
		if t.ID == p.ID || !t.PvP || t.Dead() || w.Map.InSafe(t.X, t.Y) {
			continue
		}
		if dist(hx, hy, t.X, t.Y) > radius {
			continue
		}
		dmg := max(1, (p.Atk()-t.Def())/2+w.rng.IntN(3)) // PvP 傷害減半
		t.HP -= dmg
		w.events = append(w.events, Event{K: "hit", ID: t.ID, X: int(t.X), Y: int(t.Y - 12), V: dmg})
		if t.HP <= 0 {
			t.HP = 0
			t.respawnTicks = playerRespawn
			w.events = append(w.events, Event{K: "die", X: int(t.X), Y: int(t.Y), S: "player"})
			w.queueMsg(p.ID, "qmsg", "決鬥勝利! 你擊敗了 "+t.Name)
			w.queueMsg(t.ID, "qmsg", "你在決鬥中被 "+p.Name+" 擊敗了")
		}
	}
}

// TogglePvP 切換決鬥旗標 (安全區內不得開啟)
func (w *World) TogglePvP(id int64) string {
	p, ok := w.players[id]
	if !ok {
		return ""
	}
	if !p.PvP && w.Map.InSafe(p.X, p.Y) {
		return "安全區內無法開啟決鬥模式"
	}
	p.PvP = !p.PvP
	if p.PvP {
		return "決鬥模式 ON — 其他同樣開啟的玩家可以攻擊你"
	}
	return "決鬥模式 OFF"
}

// killMonster 擊殺結算：金幣 + 素材掉落 + 劇情推進 + 排程重生
func (w *World) killMonster(mo *Monster, killer *Player) {
	k := Kinds[mo.Kind]
	gold := k.GoldMin + w.rng.IntN(k.GoldMax-k.GoldMin+1)
	// 通關後重打 Boss: 獎勵加倍 (endgame farming)
	if k.Boss && killer.Quest >= len(Stages)-1 {
		gold *= 2
		w.queueMsg(killer.ID, "msg", "討伐獎勵加倍 (通關後獎勵)")
	}
	killer.Gold += gold
	w.events = append(w.events,
		Event{K: "die", X: int(mo.X), Y: int(mo.Y), S: mo.Kind},
		Event{K: "gold", ID: killer.ID, V: gold, X: int(mo.X), Y: int(mo.Y - 20)},
	)
	// 素材掉落 (自動入包)
	if k.DropID != "" && w.rng.IntN(100) < k.DropPct && killer.Inv[k.DropID] < 99 {
		killer.Inv[k.DropID]++
		w.events = append(w.events, Event{K: "mat", ID: killer.ID, S: k.DropID, X: int(mo.X), Y: int(mo.Y - 30)})
	}
	w.rareDrop(mo, killer)
	w.onBossKill(mo, killer)
	delete(w.monsters, mo.ID)
	if !mo.NoRespawn {
		w.respawns = append(w.respawns, respawnJob{kind: mo.Kind, homeX: mo.HomeX, homeY: mo.HomeY, ticks: k.Respawn})
	}
}

// bossBlast Boss 範圍爆發 (魔像震地 / 根源星爆): 半徑內全體玩家受擊
func (w *World) bossBlast(mo *Monster, radius float64) {
	w.events = append(w.events, Event{K: "slam", X: int(mo.X), Y: int(mo.Y), V: int(radius)})
	for _, p := range w.players {
		if p.Dead() || dist(mo.X, mo.Y, p.X, p.Y) > radius {
			continue
		}
		dmg := max(1, Kinds[mo.Kind].Dmg-p.Def()+w.rng.IntN(5))
		p.HP -= dmg
		w.events = append(w.events, Event{K: "hit", ID: p.ID, X: int(p.X), Y: int(p.Y - 12), V: dmg})
		if p.HP <= 0 {
			p.HP = 0
			p.respawnTicks = playerRespawn
			w.events = append(w.events, Event{K: "die", X: int(p.X), Y: int(p.Y), S: "player"})
		}
	}
}

// portalTick 傳送點: 階梯與深淵之門 (進度不足則擋下並提示)
func (w *World) portalTick(p *Player) {
	if p.Dead() {
		return
	}
	tx, ty := int(p.X)/TileSize, int(p.Y)/TileSize
	for _, pt := range Portals {
		if tx != pt.From[0] || ty != pt.From[1] {
			continue
		}
		if pt.MinQuest > 0 && p.Quest < pt.MinQuest {
			if w.tick%40 == 0 { // 提示節流
				w.queueMsg(p.ID, "msg", pt.Deny)
			}
			return
		}
		w.events = append(w.events, Event{K: "tp", X: int(p.X), Y: int(p.Y)})
		p.X = float64(pt.To[0]*TileSize + TileSize/2)
		p.Y = float64(pt.To[1]*TileSize + TileSize/2)
		w.events = append(w.events, Event{K: "tp", X: int(p.X), Y: int(p.Y)})
		return
	}
}

// monsterHit 怪物攻擊玩家 (由 Monster.step 呼叫)
func (w *World) monsterHit(mo *Monster, p *Player) {
	if w.Map.InSafe(p.X, p.Y) || p.Dead() {
		return
	}
	dmg := max(1, Kinds[mo.Kind].Dmg-p.Def()+w.rng.IntN(3)-1)
	p.HP -= dmg
	w.events = append(w.events, Event{K: "hit", ID: p.ID, X: int(p.X), Y: int(p.Y - 12), V: dmg})
	if p.HP <= 0 {
		p.HP = 0
		p.respawnTicks = playerRespawn
		w.events = append(w.events, Event{K: "die", X: int(p.X), Y: int(p.Y), S: "player"})
	}
}

// nearCounter 貼近的櫃檯商店類型；沒有回傳 ("", false)
func (w *World) nearCounter(p *Player) (string, bool) {
	bestStore, bestDist := "", 2.75*Unit
	for _, cs := range w.counters {
		for _, c := range cs.tiles {
			cx := float64(c[0]*TileSize + TileSize/2)
			cy := float64(c[1]*TileSize + TileSize/2)
			if d := dist(p.X, p.Y, cx, cy); d < bestDist {
				bestDist, bestStore = d, cs.store
			}
		}
	}
	return bestStore, bestStore != ""
}

// Buy 購買：回傳提示訊息給該玩家
func (w *World) Buy(id int64, itemID string) string {
	p, ok := w.players[id]
	if !ok || p.Dead() {
		return ""
	}
	it := ItemByID(itemID)
	if it == nil {
		return "No such item"
	}
	store, near := w.nearCounter(p)
	if !near {
		return "Walk to the shop counter first"
	}
	if it.Store != store {
		return "This counter doesn't sell that"
	}
	if p.Gold < it.Price {
		return "Not enough gold"
	}
	switch it.Kind {
	case KindWeapon:
		p.Weapon = it.ID
	case KindArmor:
		p.Armor = it.ID
	case KindPotion:
		if p.Inv[it.ID] >= maxPerItem {
			return "Bag full for " + it.Name
		}
		p.Inv[it.ID]++
	}
	p.Gold -= it.Price
	return "Bought " + it.Name
}

// UseItem 使用消耗品 (回血或限時 buff)
func (w *World) UseItem(id int64, itemID string) string {
	p, ok := w.players[id]
	if !ok || p.Dead() {
		return ""
	}
	it := ItemByID(itemID)
	if it == nil || it.Kind != KindPotion || p.Inv[it.ID] <= 0 {
		return ""
	}
	p.Inv[it.ID]--
	switch {
	case it.Heal > 0:
		p.HP = min(playerMaxHP, p.HP+it.Heal)
		w.events = append(w.events, Event{K: "heal", ID: p.ID, X: int(p.X), Y: int(p.Y - 12), V: it.Heal})
	case it.SpeedPct > 0:
		p.speedPct = it.SpeedPct
		p.speedTicks = it.BuffSec * TickRate
	case it.AtkBuff > 0:
		p.atkBonus = it.AtkBuff
		p.atkTicks = it.BuffSec * TickRate
	}
	return ""
}

// Tick 前進一個模擬步
func (w *World) Tick() {
	w.tick++
	for _, p := range w.players {
		p.step(w.Map)
		inSafe := w.Map.InSafe(p.X, p.Y)
		// 安全區緩慢回血
		if !p.Dead() && p.HP < playerMaxHP && inSafe && w.tick%safeRegenEvery == 0 {
			p.HP = min(playerMaxHP, p.HP+safeRegenHP)
		}
		// 踏入安全區 = 存檔點
		if inSafe && !p.wasSafe && !p.Dead() {
			w.SavePlayer(p.ID)
			if w.store != nil {
				w.queueMsg(p.ID, "msg", "進度已保存 (安全區存檔點)")
			}
		}
		p.wasSafe = inSafe
		w.questTick(p)
		w.portalTick(p)
	}
	for _, mo := range w.monsters {
		mo.step(w)
	}
	// 怪物重生排程
	remain := w.respawns[:0]
	for _, job := range w.respawns {
		job.ticks--
		if job.ticks <= 0 {
			w.nextID++
			w.monsters[w.nextID] = &Monster{
				ID: w.nextID, Kind: job.kind,
				X: job.homeX, Y: job.homeY, HomeX: job.homeX, HomeY: job.homeY,
				HP: Kinds[job.kind].MaxHP, Dir: 'd',
			}
		} else {
			remain = append(remain, job)
		}
	}
	w.respawns = remain
}

// ---- 快照 (wire snapshot) ----

// PlayerState 廣播用玩家狀態
type PlayerState struct {
	ID   int64          `json:"id"`
	N    string         `json:"n"`
	X    int            `json:"x"`
	Y    int            `json:"y"`
	D    string         `json:"d"`
	HP   int            `json:"hp"`
	MHP  int            `json:"mh"`
	G    int            `json:"g"`
	W    string         `json:"w,omitempty"`
	A    string         `json:"a,omitempty"`
	Iv   map[string]int `json:"iv,omitempty"` // 消耗品/素材數量
	Bs   int            `json:"bs,omitempty"` // 加速 buff 剩餘 ticks
	Ba   int            `json:"ba,omitempty"` // 攻擊 buff 剩餘 ticks
	Q    int            `json:"q"`            // 劇情階段
	Pv   bool           `json:"pv,omitempty"` // 決鬥模式
	Dead bool           `json:"dd,omitempty"`
}

// MonsterState 廣播用怪物狀態
type MonsterState struct {
	ID  int64  `json:"id"`
	K   string `json:"k"`
	X   int    `json:"x"`
	Y   int    `json:"y"`
	D   string `json:"d"`
	HP  int    `json:"hp"`
	MHP int    `json:"mh"`
	Rg  bool   `json:"rg,omitempty"` // 狂暴中
}

// State 每 tick 廣播內容
type State struct {
	P []PlayerState  `json:"p"`
	M []MonsterState `json:"m"`
	E []Event        `json:"e,omitempty"`
}

// Snapshot 產生目前快照並清空事件緩衝
func (w *World) Snapshot() State {
	st := State{
		P: make([]PlayerState, 0, len(w.players)),
		M: make([]MonsterState, 0, len(w.monsters)),
	}
	for _, p := range w.players {
		st.P = append(st.P, PlayerState{
			ID: p.ID, N: p.Name, X: int(p.X), Y: int(p.Y), D: string(p.Dir),
			HP: p.HP, MHP: playerMaxHP, G: p.Gold,
			W: p.Weapon, A: p.Armor, Iv: p.Inv,
			Bs: p.speedTicks, Ba: p.atkTicks, Q: p.Quest, Pv: p.PvP, Dead: p.Dead(),
		})
	}
	for _, mo := range w.monsters {
		st.M = append(st.M, MonsterState{
			ID: mo.ID, K: mo.Kind, X: int(mo.X), Y: int(mo.Y), D: string(mo.Dir),
			HP: mo.HP, MHP: Kinds[mo.Kind].MaxHP, Rg: mo.enraged,
		})
	}
	st.E = w.events
	w.events = nil
	return st
}
