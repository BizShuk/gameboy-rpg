package game

// story_test.go — 主線劇情端到端測試: 從接任務到全通 (S0→S8)

import "testing"

// teleportTo 把玩家傳到 NPC 面前 (測試用)
func teleportTo(p *Player, npcID string) {
	n := npcByID(npcID)
	p.X, p.Y = float64(n.X), float64(n.Y)+12
}

// rectCenterPx 觸發區中心像素座標 (測試用)
func rectCenterPx(r Rect) (float64, float64) {
	return (float64(r.X1+r.X2)/2 + 0.5) * TileSize, (float64(r.Y1+r.Y2)/2 + 0.5) * TileSize
}

// findMonster 找一隻指定種類的怪
func findMonster(w *World, kind string) *Monster {
	for _, mo := range w.monsters {
		if mo.Kind == kind {
			return mo
		}
	}
	return nil
}

// slay 直接把怪打到死 (清冷卻連砍)
func slay(t *testing.T, w *World, p *Player, mo *Monster) {
	t.Helper()
	p.X, p.Y = mo.X-12, mo.Y
	p.Dir = 'r'
	for range 200 {
		w.Attack(p.ID)
		p.atkCD = 0
		if _, alive := w.monsters[mo.ID]; !alive {
			return
		}
		mo.X, mo.Y = p.X+12, p.Y // 固定站位, 避免走位脫靶
	}
	t.Fatalf("failed to slay %s", mo.Kind)
}

func TestStoryFullPlaythrough(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("勇者")

	// S0: 接任務
	teleportTo(p, "elder")
	d := w.TalkNPC(p.ID, "elder")
	if d == nil || len(d.Acts) == 0 || d.Acts[0].ID != "accept" {
		t.Fatalf("S0 elder dialog missing accept: %+v", d)
	}
	if w.DialogAction(p.ID, "accept") == nil || p.Quest != 1 {
		t.Fatalf("accept failed, quest=%d", p.Quest)
	}

	// S1: 凝膠 x5 → 回報村長
	p.Inv["slime_gel"] = 5
	goldBefore := p.Gold
	d = w.TalkNPC(p.ID, "elder")
	if d == nil || len(d.Acts) == 0 || d.Acts[0].ID != "turnin_gel" {
		t.Fatalf("S1 turnin not offered: %+v", d)
	}
	if w.DialogAction(p.ID, "turnin_gel") == nil || p.Quest != 2 {
		t.Fatalf("turnin_gel failed, quest=%d", p.Quest)
	}
	if p.Gold != goldBefore+40 || p.Inv["slime_gel"] != 0 {
		t.Errorf("S1 reward wrong: gold %d→%d, gel=%d", goldBefore, p.Gold, p.Inv["slime_gel"])
	}

	// S2: 甲殼 x4 → 鐵匠鍛造護甲
	teleportTo(p, "smith")
	p.Inv["beetle_shell"] = 4
	if w.DialogAction(p.ID, "craft_shell") == nil || p.Quest != 3 {
		t.Fatalf("craft_shell failed, quest=%d", p.Quest)
	}
	if p.Armor != "shell_armor" || p.Def() != 5 {
		t.Errorf("shell_armor not equipped: %q def=%d", p.Armor, p.Def())
	}

	// S3: 狼牙 x3 + 30G → 狼牙劍
	p.Inv["wolf_fang"] = 3
	p.Gold = 50
	if w.DialogAction(p.ID, "craft_fang") == nil || p.Quest != 4 {
		t.Fatalf("craft_fang failed, quest=%d", p.Quest)
	}
	if p.Weapon != "fang_blade" || p.Gold != 20 {
		t.Errorf("fang_blade craft wrong: %q gold=%d", p.Weapon, p.Gold)
	}

	// S4: 抵達神殿入口 (tick 觸發; 觸發區由生成資料取中心)
	p.X, p.Y = rectCenterPx(ShrineGate)
	w.questTick(p)
	if p.Quest != 5 {
		t.Fatalf("reach shrine failed, quest=%d", p.Quest)
	}

	// S5: 討伐月蝕狼王
	wk := findMonster(w, "wolf_king")
	if wk == nil {
		t.Fatal("wolf_king not spawned")
	}
	p.Weapon = "moon_blade" // 測試加速: 用高攻武器砍
	slay(t, w, p, wk)
	if p.Quest != 6 {
		t.Fatalf("wolf_king kill did not advance, quest=%d", p.Quest)
	}

	// S6: 討伐暗影史萊姆王
	sk := findMonster(w, "slime_king")
	if sk == nil {
		t.Fatal("slime_king not spawned")
	}
	slay(t, w, p, sk)
	if p.Quest != 7 {
		t.Fatalf("slime_king kill did not advance, quest=%d", p.Quest)
	}

	// S7: 回報村長 → 第一章完
	teleportTo(p, "elder")
	goldBefore = p.Gold
	d = w.TalkNPC(p.ID, "elder")
	if d == nil || len(d.Acts) == 0 || d.Acts[0].ID != "finale" {
		t.Fatalf("finale not offered: %+v", d)
	}
	if w.DialogAction(p.ID, "finale") == nil || p.Quest != 8 {
		t.Fatalf("finale failed, quest=%d", p.Quest)
	}
	if p.Weapon != "moon_blade" || p.Gold != goldBefore+100 {
		t.Errorf("finale rewards wrong: %q gold %d→%d", p.Weapon, goldBefore, p.Gold)
	}
	// 煙火事件已排入
	fw := 0
	for _, e := range w.events {
		if e.K == "fw" {
			fw++
		}
	}
	if fw == 0 {
		t.Error("no fireworks queued at finale")
	}

	// ---- 第二章《星墜之淵》----
	// S8: 接第二章
	if w.DialogAction(p.ID, "ch2_accept") == nil || p.Quest != 9 {
		t.Fatalf("ch2_accept failed, quest=%d", p.Quest)
	}
	// S9: 隕鐵 x4 + 80G → 星隕劍
	teleportTo(p, "smith")
	p.Inv["meteor_shard"] = 4
	p.Gold = 100
	if w.DialogAction(p.ID, "craft_star") == nil || p.Quest != 10 {
		t.Fatalf("craft_star failed, quest=%d", p.Quest)
	}
	if p.Weapon != "star_blade" || p.Gold != 20 {
		t.Errorf("star_blade craft wrong: %q gold=%d", p.Weapon, p.Gold)
	}
	// S10: 抵達深淵之門
	p.X, p.Y = rectCenterPx(AbyssGate)
	w.questTick(p)
	if p.Quest != 11 {
		t.Fatalf("reach abyss gate failed, quest=%d", p.Quest)
	}
	// S11: 討伐暗月魔像
	gm := findMonster(w, "eclipse_golem")
	if gm == nil {
		t.Fatal("eclipse_golem not spawned")
	}
	slay(t, w, p, gm)
	if p.Quest != 12 {
		t.Fatalf("golem kill did not advance, quest=%d", p.Quest)
	}
	// S12: 回報 → 兩章全通
	teleportTo(p, "elder")
	goldBefore = p.Gold
	if w.DialogAction(p.ID, "finale2") == nil || p.Quest != 13 {
		t.Fatalf("finale2 failed, quest=%d", p.Quest)
	}
	if p.Armor != "moon_ward" || p.Def() != 12 || p.Gold != goldBefore+150 {
		t.Errorf("finale2 rewards wrong: armor=%q def=%d gold %d→%d", p.Armor, p.Def(), goldBefore, p.Gold)
	}

	// ---- 第三章《月之彼端》----
	// S13: 接第三章
	if w.DialogAction(p.ID, "ch3_accept") == nil || p.Quest != 14 {
		t.Fatalf("ch3_accept failed, quest=%d", p.Quest)
	}
	// S14: 踏入月之裏側 (傳送門需 quest>=14)
	p.X = float64(Portals[2].From[0]*TileSize + 8)
	p.Y = float64(Portals[2].From[1]*TileSize + 8)
	w.portalTick(p)
	if !w.Map.InVoid(p.Y) {
		t.Fatalf("abyss portal did not send player to void: row %d", int(p.Y)/TileSize)
	}
	w.questTick(p)
	if p.Quest != 15 {
		t.Fatalf("reach void failed, quest=%d", p.Quest)
	}
	// S15: 虛空結晶 x5 + 200G → 虛空之刃
	teleportTo(p, "smith")
	p.Inv["void_crystal"] = 5
	p.Gold = 250
	if w.DialogAction(p.ID, "craft_void") == nil || p.Quest != 16 {
		t.Fatalf("craft_void failed, quest=%d", p.Quest)
	}
	if p.Weapon != "void_edge" || p.Gold != 50 {
		t.Errorf("void_edge craft wrong: %q gold=%d", p.Weapon, p.Gold)
	}
	// S16: 抵達核心祭壇
	p.X, p.Y = rectCenterPx(CoreAltar)
	w.questTick(p)
	if p.Quest != 17 {
		t.Fatalf("reach core altar failed, quest=%d", p.Quest)
	}
	// S17: 討伐月蝕根源 (途中應進入狂暴)
	core := findMonster(w, "eclipse_core")
	if core == nil {
		t.Fatal("eclipse_core not spawned")
	}
	slay(t, w, p, core)
	if p.Quest != 18 {
		t.Fatalf("core kill did not advance, quest=%d", p.Quest)
	}
	// S18: 回報 → 三章全通
	teleportTo(p, "elder")
	goldBefore = p.Gold
	if w.DialogAction(p.ID, "finale3") == nil || p.Quest != 19 {
		t.Fatalf("finale3 failed, quest=%d", p.Quest)
	}
	if p.Armor != "aegis_dawn" || p.Def() != 16 || p.Gold != goldBefore+500 {
		t.Errorf("finale3 rewards wrong: armor=%q def=%d gold %d→%d", p.Armor, p.Def(), goldBefore, p.Gold)
	}
	if last := Stages[len(Stages)-1]; p.Quest != last.Q {
		t.Errorf("final quest = %d, want %d (%s)", p.Quest, last.Q, last.Title)
	}
}

// TestVoidPortalGate 深淵傳送門需第三章進度; 不足時擋下並提示
func TestVoidPortalGate(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("early")
	gate := Portals[2]
	p.X = float64(gate.From[0]*TileSize + 8)
	p.Y = float64(gate.From[1]*TileSize + 8)
	w.PopOutbox() // 清掉入場訊息
	w.tick = 40   // 對齊提示節流
	w.portalTick(p)
	if w.Map.InVoid(p.Y) {
		t.Fatal("portal must not open before chapter 3")
	}
	var denied bool
	for _, m := range w.PopOutbox() {
		if m.PID == p.ID && m.Txt == gate.Deny {
			denied = true
		}
	}
	if !denied {
		t.Error("no denial message sent")
	}
	// 進度足夠後放行
	p.Quest = gate.MinQuest
	w.portalTick(p)
	if !w.Map.InVoid(p.Y) {
		t.Errorf("portal should open at quest %d (row %d)", gate.MinQuest, int(p.Y)/TileSize)
	}
}

// TestCoreEnrage 月蝕根源半血狂暴: 事件 + 加速 + 星爆
func TestCoreEnrage(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("finisher")
	core := findMonster(w, "eclipse_core")
	if core == nil {
		t.Fatal("eclipse_core not spawned")
	}
	core.HP = Kinds["eclipse_core"].MaxHP * 40 / 100 // 掉到 40%
	p.X, p.Y = core.X-2*Unit, core.Y
	p.HP = playerMaxHP
	w.Snapshot()
	for range novaCharge + 10 {
		w.Tick()
	}
	if !core.Enraged() {
		t.Fatal("core did not enrage below 50% hp")
	}
	st := w.Snapshot()
	var rage, tel, slam bool
	for _, e := range st.E {
		switch e.K {
		case "rage":
			rage = true
		case "tel":
			tel = true
		case "slam":
			slam = true
		}
	}
	if !rage && !tel && !slam {
		t.Errorf("expected rage/nova events, got %+v", st.E)
	}
	if p.HP >= playerMaxHP {
		t.Errorf("nova did not damage nearby player: hp=%d", p.HP)
	}
}

// TestStairsAndSlam 階梯傳送與魔像震地波
func TestStairsAndSlam(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("delver")
	// 踩神殿 '>' → 傳到地下層
	p.X = float64(StairsDownTile[0]*TileSize + 8)
	p.Y = float64(StairsDownTile[1]*TileSize + 8)
	w.portalTick(p)
	if int(p.Y)/TileSize != StairsDownLand[1] {
		t.Fatalf("stairs down failed: at row %d", int(p.Y)/TileSize)
	}
	// 踩 '<' → 回神殿
	p.X = float64(StairsUpTile[0]*TileSize + 8)
	p.Y = float64(StairsUpTile[1]*TileSize + 8)
	w.portalTick(p)
	if int(p.Y)/TileSize != StairsUpLand[1] {
		t.Fatalf("stairs up failed: at row %d", int(p.Y)/TileSize)
	}
	// 魔像震地: 貼近觸發蓄力 → 引爆傷害 + tel/slam 事件
	gm := findMonster(w, "eclipse_golem")
	p.X, p.Y = gm.X-1.5*Unit, gm.Y
	p.HP = playerMaxHP
	w.Snapshot() // 清空既有事件
	for range slamCharge + 5 {
		w.Tick()
	}
	st := w.Snapshot()
	var tel, slam bool
	for _, e := range st.E {
		if e.K == "tel" {
			tel = true
		}
		if e.K == "slam" {
			slam = true
		}
	}
	if !tel || !slam {
		t.Errorf("slam events missing: tel=%v slam=%v", tel, slam)
	}
	if p.HP >= playerMaxHP {
		t.Errorf("slam did not damage player: hp=%d", p.HP)
	}
}

// TestStoryGuards 防呆: 距離不足/材料不足/階段不符都不得推進
func TestStoryGuards(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("cheater")

	// 離 NPC 太遠不能對話/接任務 (出生點就在村長旁, 先走遠)
	p.X, p.Y = float64(npcByID("elder").X)+12*TileSize, float64(npcByID("elder").Y)
	if w.TalkNPC(p.ID, "elder") != nil {
		t.Error("talk should require proximity")
	}
	if w.DialogAction(p.ID, "accept") != nil || p.Quest != 0 {
		t.Error("accept should require proximity")
	}
	// 材料不足不能交付
	teleportTo(p, "elder")
	w.DialogAction(p.ID, "accept")
	if w.DialogAction(p.ID, "turnin_gel") != nil {
		t.Error("turnin should require 5 gel")
	}
	// 階段不符不能跳關
	if w.DialogAction(p.ID, "finale") != nil || p.Quest != 1 {
		t.Error("finale should require quest=7")
	}
}

// TestDropsAndSummon 素材掉落與史萊姆王召喚
func TestDropsAndSummon(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("hunter")

	// slime 掉落率 100 → 必掉凝膠
	sl := findMonster(w, "slime")
	p.Weapon = "moon_blade"
	slay(t, w, p, sl)
	if p.Inv["slime_gel"] < 1 {
		t.Errorf("slime gel not dropped: %d", p.Inv["slime_gel"])
	}

	// slime_king 進入戰鬥後召喚小怪 (NoRespawn)
	sk := findMonster(w, "slime_king")
	before := len(w.monsters)
	p.X, p.Y = sk.X-40, sk.Y // 貼近觸發索敵 (神殿內非安全區)
	p.HP = playerMaxHP
	w.Tick()
	if len(w.monsters) <= before {
		t.Fatalf("slime_king did not summon: %d -> %d", before, len(w.monsters))
	}
	// 召喚物死亡不排重生
	var minion *Monster
	for _, mo := range w.monsters {
		if mo.NoRespawn {
			minion = mo
			break
		}
	}
	if minion == nil {
		t.Fatal("no summoned minion found")
	}
	jobs := len(w.respawns)
	slay(t, w, p, minion)
	if len(w.respawns) != jobs {
		t.Errorf("summoned minion scheduled respawn: %d -> %d", jobs, len(w.respawns))
	}
}
