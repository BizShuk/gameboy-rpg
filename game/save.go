package game

// save.go — 玩家進度持久化 (progress persistence)
// 以玩家名稱為 key 存 quest/裝備/金幣/背包; 斷線存檔, 同名再入場即續玩。
// 儲存體為介面, World 不認識檔案系統 (測試用 memory 實作)。

import "maps"

// Progress 一位玩家的可存檔進度
type Progress struct {
	Name   string         `json:"name"`
	Quest  int            `json:"quest"`
	Gold   int            `json:"gold"`
	Weapon string         `json:"weapon,omitempty"`
	Armor  string         `json:"armor,omitempty"`
	Inv    map[string]int `json:"inv,omitempty"`
}

// Store 進度儲存體 (檔案或記憶體)
type Store interface {
	Load(name string) (Progress, bool)
	Save(p Progress)
}

// MemStore 記憶體儲存體 (預設; 測試與無持久化模式)
type MemStore struct{ m map[string]Progress }

// NewMemStore 建立記憶體儲存體
func NewMemStore() *MemStore { return &MemStore{m: map[string]Progress{}} }

// Load 讀取進度
func (s *MemStore) Load(name string) (Progress, bool) {
	p, ok := s.m[name]
	return p, ok
}

// Save 寫入進度
func (s *MemStore) Save(p Progress) { s.m[p.Name] = p }

// progressOf 擷取玩家目前進度 (略過數量為 0 的物品)
func progressOf(p *Player) Progress {
	inv := make(map[string]int, len(p.Inv))
	for k, v := range p.Inv {
		if v > 0 {
			inv[k] = v
		}
	}
	return Progress{
		Name: p.Name, Quest: p.Quest, Gold: p.Gold,
		Weapon: p.Weapon, Armor: p.Armor, Inv: inv,
	}
}

// applyProgress 套用存檔到玩家
func applyProgress(p *Player, pr Progress) {
	p.Quest = pr.Quest
	p.Gold = pr.Gold
	p.Weapon = pr.Weapon
	p.Armor = pr.Armor
	maps.Copy(p.Inv, pr.Inv)
}

// SetStore 指定儲存體 (nil 表示不持久化)
func (w *World) SetStore(s Store) { w.store = s }

// SavePlayer 存檔指定玩家 (Hub 於斷線時呼叫)
func (w *World) SavePlayer(id int64) {
	if w.store == nil {
		return
	}
	if p, ok := w.players[id]; ok {
		w.store.Save(progressOf(p))
	}
}
