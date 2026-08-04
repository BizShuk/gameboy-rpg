package game

// save_test.go — 進度持久化: 斷線存檔 → 同名重連續玩

import "testing"

func TestProgressSaveAndResume(t *testing.T) {
	w := NewWorld()
	st := NewMemStore()
	w.SetStore(st)

	// 第一次入場: 無存檔 → 開場劇情
	p := w.AddPlayer("勇者")
	if p.Quest != 0 || p.Gold != startGold {
		t.Fatalf("fresh player wrong: quest=%d gold=%d", p.Quest, p.Gold)
	}
	// 推進進度後離線
	p.Quest = 6
	p.Gold = 321
	p.Weapon = "moon_blade"
	p.Armor = "shell_armor"
	p.Inv["meteor_shard"] = 2
	p.Inv["potion"] = 0 // 數量 0 不應存進去
	w.SavePlayer(p.ID)
	w.RemovePlayer(p.ID)

	// 同名重連: 進度復原
	p2 := w.AddPlayer("勇者")
	if p2.ID == p.ID {
		t.Error("reconnect should get a new entity id")
	}
	if p2.Quest != 6 || p2.Gold != 321 || p2.Weapon != "moon_blade" || p2.Armor != "shell_armor" {
		t.Errorf("progress not restored: %+v", progressOf(p2))
	}
	if p2.Inv["meteor_shard"] != 2 {
		t.Errorf("inventory not restored: %d", p2.Inv["meteor_shard"])
	}
	if _, ok := p2.Inv["potion"]; ok {
		t.Error("zero-count item should not be persisted")
	}
	// 位置一律回重生點 (不存座標)
	if p2.X != w.Map.SpawnX || p2.Y != w.Map.SpawnY {
		t.Errorf("resumed player should spawn at town: (%.0f,%.0f)", p2.X, p2.Y)
	}

	// 別名玩家不受影響
	other := w.AddPlayer("路人")
	if other.Quest != 0 || other.Gold != startGold {
		t.Errorf("unrelated player got progress: quest=%d gold=%d", other.Quest, other.Gold)
	}
}

// TestNoStoreIsFresh 未設定儲存體時不存檔也不崩潰
func TestNoStoreIsFresh(t *testing.T) {
	w := NewWorld()
	p := w.AddPlayer("匿名")
	p.Quest = 5
	w.SavePlayer(p.ID) // no-op
	w.RemovePlayer(p.ID)
	if again := w.AddPlayer("匿名"); again.Quest != 0 {
		t.Errorf("without store progress must not persist: quest=%d", again.Quest)
	}
}
