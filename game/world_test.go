package game

import "testing"

// reachable BFS: 兩 tile 之間是否存在非 solid 的 4 鄰通路
func reachable(m *TileMap, from, to [2]int) bool {
	if m.Solid(from[0], from[1]) || m.Solid(to[0], to[1]) {
		return false
	}
	seen := map[[2]int]bool{from: true}
	queue := [][2]int{from}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if cur == to {
			return true
		}
		for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next := [2]int{cur[0] + d[0], cur[1] + d[1]}
			if seen[next] || m.Solid(next[0], next[1]) {
				continue
			}
			seen[next] = true
			queue = append(queue, next)
		}
	}
	return false
}

// TestMapValid 生成地圖資料完整性：尺寸、生成區、重生點、商店、
// 各章結構與跨層通路 (座標一律由 map_gen.go 生成資料推導)
func TestMapValid(t *testing.T) {
	m := NewTileMap()
	if m.W != 56 || m.H != 120 {
		t.Fatalf("map size = %dx%d, want 56x120", m.W, m.H)
	}
	for _, area := range DefaultSpawnAreas() {
		found := false
		for ty := area.Region.Y1; ty <= area.Region.Y2 && !found; ty++ {
			for tx := area.Region.X1; tx <= area.Region.X2; tx++ {
				ok := m.TallGrass(tx, ty)
				if area.Floor != 0 {
					ok = m.At(tx, ty) == area.Floor
				}
				if ok {
					found = true
					break
				}
			}
		}
		if !found {
			t.Errorf("spawn area %+v has no valid spawn tile", area)
		}
	}
	if m.BoxBlocked(m.SpawnX, m.SpawnY, playerHalfW, playerHalfH) {
		t.Error("spawn point is blocked")
	}
	if !m.InSafe(m.SpawnX, m.SpawnY) {
		t.Error("spawn point should be in safe zone")
	}
	// 兩間商店櫃檯都存在 (道具店 3 + 地下層營地 2 + 裏側平台 1)
	if n := len(m.TilesOf('C')); n != 3 {
		t.Errorf("weapon counters = %d, want 3", n)
	}
	if n := len(m.TilesOf('A')); n != 6 {
		t.Errorf("gear counters = %d, want 6", n)
	}
	// 神殿: 觸發區可站、內部地板存在、牆與祭壇阻擋
	gateTile := [2]int{(ShrineGate.X1 + ShrineGate.X2) / 2, ShrineGate.Y1}
	if m.Solid(gateTile[0], gateTile[1]) {
		t.Error("shrine entrance should be walkable")
	}
	if len(m.TilesOf('q')) == 0 || len(m.TilesOf('Z')) == 0 || len(m.TilesOf('M')) == 0 {
		t.Error("shrine floor / wall / altar tiles missing")
	}
	if q := m.TilesOf('q'); m.Solid(q[0][0], q[0][1]) {
		t.Error("shrine floor should be walkable")
	}
	if z := m.TilesOf('Z'); !m.Solid(z[0][0], z[0][1]) {
		t.Error("shrine wall should be solid")
	}
	// 地上主動線: 神殿門前 → 重生點 → 南野區草叢 全程連通
	spawnTile := [2]int{genSpawnTile[0], genSpawnTile[1]}
	if !reachable(m, gateTile, spawnTile) {
		t.Error("no path: shrine gate -> town spawn")
	}
	// 第二章: 階梯 tile 存在; 入口階梯 → 深淵之門傳送口 連通
	if m.At(StairsDownTile[0], StairsDownTile[1]) != '>' || m.At(StairsUpTile[0], StairsUpTile[1]) != '<' {
		t.Error("stairs tiles missing")
	}
	abyssFrom := Portals[2].From
	if m.At(abyssFrom[0], abyssFrom[1]) != '@' {
		t.Error("abyss portal tile should be '@'")
	}
	if !reachable(m, StairsDownLand, abyssFrom) {
		t.Error("no path: dungeon stairs -> abyss gate")
	}
	if len(m.TilesOf('G')) == 0 {
		t.Error("abyss gate door tiles missing")
	}
	if !m.InDungeon(float64((dungeonTopRow + 2) * TileSize)) {
		t.Error("rows below dungeonTopRow should be in dungeon")
	}
	// 地下層營地: 上行階梯周圍是安全區, 營火存在且可走
	if !m.InSafe(float64(StairsUpTile[0]*TileSize+8), float64(StairsUpTile[1]*TileSize+8)) {
		t.Error("dungeon camp should be a safe zone")
	}
	campfires := [][2]int{}
	for _, c := range m.TilesOf('^') {
		if c[1] >= dungeonTopRow && c[1] < voidTopRow {
			campfires = append(campfires, c)
		}
	}
	if len(campfires) == 0 {
		t.Error("campfire tile should exist in dungeon")
	} else if m.Solid(campfires[0][0], campfires[0][1]) {
		t.Error("campfire tile should be walkable")
	}
	// 第三章: 虛空擋路、裏側入口 → 核心祭壇前 連通
	if v := m.TilesOf('v'); len(v) == 0 || !m.Solid(v[0][0], v[0][1]) {
		t.Error("void should be impassable")
	}
	voidEntry := Portals[3].From // 裏側返回傳送口 = 入口平台上的 '@'
	if m.At(voidEntry[0], voidEntry[1]) != '@' {
		t.Error("void entry portal should be '@'")
	}
	coreFront := [2]int{(CoreAltar.X1 + CoreAltar.X2) / 2, CoreAltar.Y1}
	if !reachable(m, voidEntry, coreFront) {
		t.Error("no path: void entry -> core altar")
	}
	if e := m.TilesOf('E'); len(e) == 0 || !m.Solid(e[0][0], e[0][1]) {
		t.Error("core altar should exist and be solid")
	}
	if !m.InVoid(float64((voidTopRow+2)*TileSize)) || m.InVoid(float64((voidTopRow-2)*TileSize)) {
		t.Error("InVoid boundary wrong")
	}
}

// TestPlayerMovementCollision 玩家朝樹牆移動應被擋下且不會出界
func TestPlayerMovementCollision(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("tester")
	p.SetInput(Input{Left: true})
	for range TickRate * 30 { // 走 30 秒，足以橫越整張圖
		w.Tick()
	}
	if p.X < TileSize*2 {
		t.Errorf("player escaped map: x=%.1f", p.X)
	}
	if w.Map.BoxBlocked(p.X, p.Y, playerHalfW, playerHalfH) {
		t.Errorf("player stuck inside solid tile at (%.1f, %.1f)", p.X, p.Y)
	}
}

// TestMonstersNeverEnterSafeZone 怪物追擊時不可踏入安全區
// (誘怪點取自生成的野區生怪區;安全點 = 重生點)
func TestMonstersNeverEnterSafeZone(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("bait")
	// 站到第一個草叢生怪區中央誘怪
	area := DefaultSpawnAreas()[0]
	baitX := float64((area.Region.X1+area.Region.X2)/2*TileSize + 8)
	baitY := float64((area.Region.Y1+area.Region.Y2)/2*TileSize + 8)
	p.X, p.Y = baitX, baitY
	for range TickRate * 5 {
		w.Tick()
	}
	p.X, p.Y = w.Map.SpawnX, w.Map.SpawnY // 回到安全區
	for range TickRate * 10 {
		w.Tick()
		for _, mo := range w.monsters {
			if w.Map.InSafe(mo.X, mo.Y) {
				t.Fatalf("monster %s entered safe zone at (%.1f, %.1f)", mo.Kind, mo.X, mo.Y)
			}
		}
	}
}

// TestBuyStoresAndStats 分店購買：櫃檯歸屬、攻防與金幣變化
func TestBuyStoresAndStats(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("shopper")
	p.Gold = 200
	// 武器店櫃檯前 (由生成地圖找 'C' 與其可站鄰格)
	standBy := func(ch byte) {
		for _, c := range w.Map.TilesOf(ch) {
			if stand, ok := walkableNeighbor(w.Map, c); ok {
				p.X, p.Y = float64(stand[0]*TileSize+8), float64(stand[1]*TileSize+8)
				return
			}
		}
		t.Fatalf("no standable tile beside any %q counter", string(ch))
	}
	standBy('C')
	if msg := w.Buy(p.ID, "iron_sword"); msg != "Bought Iron Sword" {
		t.Fatalf("buy iron_sword: %q", msg)
	}
	// 武器店不賣防具
	if msg := w.Buy(p.ID, "leather_armor"); msg != "This counter doesn't sell that" {
		t.Fatalf("expected store rejection, got %q", msg)
	}
	// 道具店櫃檯前
	standBy('A')
	if msg := w.Buy(p.ID, "leather_armor"); msg != "Bought Leather Armor" {
		t.Fatalf("buy leather_armor: %q", msg)
	}
	if p.Gold != 200-70-45 {
		t.Errorf("gold = %d, want 85", p.Gold)
	}
	if p.Atk() != playerBaseAtk+7 {
		t.Errorf("atk = %d, want %d", p.Atk(), playerBaseAtk+7)
	}
	if p.Def() != 3 {
		t.Errorf("def = %d, want 3", p.Def())
	}
	// 沒錢
	p.Gold = 0
	if msg := w.Buy(p.ID, "potion"); msg != "Not enough gold" {
		t.Errorf("expected not enough gold, got %q", msg)
	}
	// 離櫃檯太遠
	p.Gold = 100
	p.X, p.Y = w.Map.SpawnX, w.Map.SpawnY
	if msg := w.Buy(p.ID, "potion"); msg != "Walk to the shop counter first" {
		t.Errorf("expected distance rejection, got %q", msg)
	}
}

// TestWeaponParamsAndConsumables 武器攻速/範圍與消耗品 (回血/buff/過期)
func TestWeaponParamsAndConsumables(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("user")

	// 匕首攻速快
	p.Weapon = "copper_dagger"
	w.Attack(p.ID)
	if p.atkCD != 4 {
		t.Errorf("dagger cd = %d, want 4", p.atkCD)
	}
	// 長槍觸點更遠
	p.Weapon = "long_spear"
	if _, reach, _ := p.AtkParams(); reach != 24 {
		t.Errorf("spear reach = %v, want 24", reach)
	}
	// 回血藥
	p.Inv["potion"] = 1
	p.HP = 10
	w.UseItem(p.ID, "potion")
	if p.HP != 40 || p.Inv["potion"] != 0 {
		t.Errorf("potion: hp=%d inv=%d, want 40/0", p.HP, p.Inv["potion"])
	}
	// 加速藥 → 生效 → 過期
	p.Inv["haste_potion"] = 1
	w.UseItem(p.ID, "haste_potion")
	if p.Speed() <= playerSpeed {
		t.Errorf("haste not applied: speed=%v", p.Speed())
	}
	for range 10*TickRate + 1 {
		w.Tick()
	}
	if p.Speed() != playerSpeed {
		t.Errorf("haste not expired: speed=%v", p.Speed())
	}
	// 攻擊藥
	base := p.Atk()
	p.Inv["power_potion"] = 1
	w.UseItem(p.ID, "power_potion")
	if p.Atk() != base+6 {
		t.Errorf("power buff atk=%d, want %d", p.Atk(), base+6)
	}
}

// TestCombatKillAndRespawn 攻擊怪物到死亡：掉金幣、事件、重生排程
func TestCombatKillAndRespawn(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("fighter")
	p.Weapon = "hero_sword"
	var target *Monster
	for _, mo := range w.monsters {
		if mo.Kind == "slime" {
			target = mo
			break
		}
	}
	if target == nil {
		t.Fatal("no slime spawned")
	}
	p.X, p.Y = target.X-12, target.Y
	p.Dir = 'r'
	goldBefore := p.Gold
	nMonsters := len(w.monsters)
	for range 10 {
		w.Attack(p.ID)
		p.atkCD = 0 // 測試直接清冷卻
		if _, alive := w.monsters[target.ID]; !alive {
			break
		}
	}
	if _, alive := w.monsters[target.ID]; alive {
		t.Fatal("slime survived 10 hero_sword hits")
	}
	if p.Gold <= goldBefore {
		t.Errorf("no gold drop: %d -> %d", goldBefore, p.Gold)
	}
	// 揮擊為範圍傷害, 相鄰怪可能一起死 → 至少 1 筆重生排程
	if len(w.respawns) == 0 {
		t.Fatal("no respawn job scheduled")
	}
	for range Kinds["slime"].Respawn + 1 {
		w.Tick()
	}
	if len(w.monsters) != nMonsters {
		t.Errorf("monsters after respawn = %d, want %d", len(w.monsters), nMonsters)
	}
	st := w.Snapshot()
	if len(st.M) != nMonsters || len(st.P) != 1 {
		t.Errorf("snapshot sizes p=%d m=%d", len(st.P), len(st.M))
	}
}

// TestSafeZoneRegen 安全區內自動回血
func TestSafeZoneRegen(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("rester")
	p.HP = 10
	for range TickRate * 5 {
		w.Tick()
	}
	if p.HP <= 10 {
		t.Errorf("hp did not regen in safe zone: %d", p.HP)
	}
}
