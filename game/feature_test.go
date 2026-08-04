package game

// feature_test.go — 存檔點/同名處理/稀有掉落/通關獎勵/PvP/補給站

import "testing"

// TestSafeZoneAutoSave 踏入安全區即存檔並提示 (只在進入的那一刻)
func TestSafeZoneAutoSave(t *testing.T) {
	w := NewWorld()
	w.SetStore(NewMemStore())
	p := w.AddPlayer("saver")
	p.Quest = 3
	// 走出安全區
	p.X, p.Y = 6*TileSize, 44*TileSize
	w.Tick()
	w.PopOutbox()
	// 走回安全區 → 觸發存檔
	p.X, p.Y = 20*TileSize, 44*TileSize
	w.Tick()
	var saved bool
	for _, m := range w.PopOutbox() {
		if m.PID == p.ID && m.Txt == "進度已保存 (安全區存檔點)" {
			saved = true
		}
	}
	if !saved {
		t.Error("entering safe zone should announce a save")
	}
	if pr, ok := w.store.Load("saver"); !ok || pr.Quest != 3 {
		t.Errorf("progress not written on safe-zone entry: %+v", pr)
	}
	// 停留在安全區不應重複提示
	w.Tick()
	for _, m := range w.PopOutbox() {
		if m.Txt == "進度已保存 (安全區存檔點)" {
			t.Error("save message repeated while standing still")
		}
	}
}

// TestDuplicateNameOnline 同名同時上線自動加序號 (存檔不互相覆蓋)
func TestDuplicateNameOnline(t *testing.T) {
	w := NewWorld()
	w.SetStore(NewMemStore())
	a := w.AddPlayer("Ash")
	b := w.AddPlayer("Ash")
	if b.Name == a.Name {
		t.Fatalf("duplicate name not renamed: both %q", a.Name)
	}
	if b.Name != "Ash-2" {
		t.Errorf("renamed to %q, want Ash-2", b.Name)
	}
	a.Quest, b.Quest = 5, 9
	w.SavePlayer(a.ID)
	w.SavePlayer(b.ID)
	if pr, _ := w.store.Load("Ash"); pr.Quest != 5 {
		t.Errorf("Ash save clobbered: quest=%d", pr.Quest)
	}
	if pr, _ := w.store.Load("Ash-2"); pr.Quest != 9 {
		t.Errorf("Ash-2 save wrong: quest=%d", pr.Quest)
	}
	// 離線後同名可以復用
	w.RemovePlayer(a.ID)
	if c := w.AddPlayer("Ash"); c.Name != "Ash" || c.Quest != 5 {
		t.Errorf("name should be reusable after logout: %q quest=%d", c.Name, c.Quest)
	}
}

// TestRareDropEquips 稀有掉落: 更好才裝上, 較差只提示
func TestRareDropEquips(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("hunter")
	mo := &Monster{ID: 999, Kind: "gargoyle", X: p.X, Y: p.Y}
	k := Kinds["gargoyle"] // stone_plate DEF 9
	k.RarePct = 100
	Kinds["gargoyle"] = k
	defer func() { k.RarePct = 6; Kinds["gargoyle"] = k }()

	w.rareDrop(mo, p) // 徒手 → 應裝上
	if p.Armor != "stone_plate" {
		t.Fatalf("rare armor not equipped: %q", p.Armor)
	}
	// 已有更好的裝備 → 不降級
	p.Armor = "aegis_dawn" // DEF 16
	w.rareDrop(mo, p)
	if p.Armor != "aegis_dawn" {
		t.Errorf("better armor was downgraded to %q", p.Armor)
	}
}

// TestEndgameBossBonus 通關後 Boss 金幣加倍
func TestEndgameBossBonus(t *testing.T) {
	base := NewWorld()
	rookie := base.AddPlayer("rookie")
	boss := findMonster(base, "wolf_king")
	if boss == nil {
		t.Fatal("wolf_king missing")
	}
	before := rookie.Gold
	base.killMonster(boss, rookie)
	normal := rookie.Gold - before

	w2 := NewWorld()
	vet := w2.AddPlayer("veteran")
	vet.Quest = len(Stages) - 1 // 全通
	boss2 := findMonster(w2, "wolf_king")
	before2 := vet.Gold
	w2.killMonster(boss2, vet)
	bonus := vet.Gold - before2

	k := Kinds["wolf_king"]
	if normal > k.GoldMax || bonus < k.GoldMin*2 {
		t.Errorf("endgame bonus not applied: normal=%d bonus=%d (range %d-%d)", normal, bonus, k.GoldMin, k.GoldMax)
	}
}

// TestPvPRules 決鬥: 需雙方開啟且在安全區外; 安全區內不得開啟
func TestPvPRules(t *testing.T) {
	w := NewWorld()
	a := w.AddPlayer("duelistA")
	b := w.AddPlayer("duelistB")

	// 安全區內不得開啟
	if msg := w.TogglePvP(a.ID); msg != "安全區內無法開啟決鬥模式" {
		t.Fatalf("safe-zone toggle should be rejected, got %q", msg)
	}
	// 移到野區
	for _, p := range []*Player{a, b} {
		p.X, p.Y = 6*TileSize, 44*TileSize
	}
	b.X = a.X + 0.6*Unit
	w.TogglePvP(a.ID)
	if !a.PvP {
		t.Fatal("pvp not enabled outside safe zone")
	}
	// 只有 A 開 → 打不到 B
	a.Dir = 'r'
	hpBefore := b.HP
	w.Attack(a.ID)
	if b.HP != hpBefore {
		t.Errorf("one-sided pvp should not damage: %d → %d", hpBefore, b.HP)
	}
	// 雙方都開 → 造成傷害
	w.TogglePvP(b.ID)
	a.atkCD = 0
	w.Attack(a.ID)
	if b.HP >= hpBefore {
		t.Errorf("mutual pvp did no damage: %d → %d", hpBefore, b.HP)
	}
	// 回到安全區即免疫
	b.X, b.Y = w.Map.SpawnX, w.Map.SpawnY
	hp2 := b.HP
	a.atkCD = 0
	w.Attack(a.ID)
	if b.HP != hp2 {
		t.Errorf("safe zone should block pvp damage: %d → %d", hp2, b.HP)
	}
}

// TestCampMerchants 營地/星光平台有補給櫃檯, 且位於安全區內
// (座標由生成地圖推導: 'A' 於地下層 ≥2 格、裏側 ≥1 格)
func TestCampMerchants(t *testing.T) {
	w := NewWorld()
	m := w.Map
	var dungeonCounters, voidCounters [][2]int
	for _, c := range m.TilesOf('A') {
		switch {
		case c[1] >= m.VoidTopRow():
			voidCounters = append(voidCounters, c)
		case c[1] >= m.DungeonTopRow():
			dungeonCounters = append(dungeonCounters, c)
		}
	}
	if len(dungeonCounters) < 2 {
		t.Fatalf("dungeon camp counters = %d, want >= 2", len(dungeonCounters))
	}
	if len(voidCounters) < 1 {
		t.Fatalf("void platform counters = %d, want >= 1", len(voidCounters))
	}
	// 站在營地櫃檯旁可以買東西 (找櫃檯四鄰的可走格)
	p := w.AddPlayer("delver")
	p.Gold = 100
	c := dungeonCounters[0]
	stand, ok := walkableNeighbor(m, c)
	if !ok {
		t.Fatalf("no walkable tile beside camp counter (%d,%d)", c[0], c[1])
	}
	p.X, p.Y = float64(stand[0]*TileSize+8), float64(stand[1]*TileSize+8)
	if msg := w.Buy(p.ID, "potion"); msg != "Bought Potion" {
		t.Errorf("camp merchant purchase failed: %q", msg)
	}
	// 裏側中繼平台 (櫃檯所在) 是安全區
	v := voidCounters[0]
	if !m.InSafe(float64(v[0]*TileSize+8), float64(v[1]*TileSize+8)) {
		t.Error("void mid platform should be a safe zone")
	}
}

// walkableNeighbor 回傳 tile 四鄰中第一個可走格
func walkableNeighbor(m *TileMap, c [2]int) ([2]int, bool) {
	for _, d := range [][2]int{{0, 1}, {0, -1}, {1, 0}, {-1, 0}} {
		if !m.Solid(c[0]+d[0], c[1]+d[1]) {
			return [2]int{c[0] + d[0], c[1] + d[1]}, true
		}
	}
	return [2]int{}, false
}
