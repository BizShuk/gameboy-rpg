package store

// file_test.go — 檔案存檔: 落盤/重開讀回/毀損容錯

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bizshuk/gameboy-rpg/game"
)

func TestFileRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "players.json")
	f, err := NewFile(path)
	if err != nil {
		t.Fatalf("NewFile: %v", err)
	}
	if f.Count() != 0 {
		t.Errorf("fresh store count = %d, want 0", f.Count())
	}
	f.Save(game.Progress{Name: "勇者", Quest: 9, Gold: 250, Weapon: "star_blade",
		Inv: map[string]int{"meteor_shard": 3}})
	f.Save(game.Progress{Name: "路人", Quest: 1, Gold: 30})

	// 重新開啟同一路徑 → 讀回
	f2, err := NewFile(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if f2.Count() != 2 {
		t.Fatalf("reopened count = %d, want 2", f2.Count())
	}
	got, ok := f2.Load("勇者")
	if !ok {
		t.Fatal("saved player missing after reopen")
	}
	if got.Quest != 9 || got.Gold != 250 || got.Weapon != "star_blade" || got.Inv["meteor_shard"] != 3 {
		t.Errorf("restored progress wrong: %+v", got)
	}
	if _, ok := f2.Load("查無此人"); ok {
		t.Error("unknown player should not load")
	}
	// 不留暫存檔
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Error("temp file left behind")
	}
}

func TestFileCorruptStartsFresh(t *testing.T) {
	path := filepath.Join(t.TempDir(), "players.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := NewFile(path)
	if err != nil {
		t.Fatalf("corrupt file should not error: %v", err)
	}
	if f.Count() != 0 {
		t.Errorf("corrupt store count = %d, want 0", f.Count())
	}
	f.Save(game.Progress{Name: "新人", Quest: 2}) // 仍可寫入
	if f2, _ := NewFile(path); f2.Count() != 1 {
		t.Error("store not usable after corruption recovery")
	}
}
