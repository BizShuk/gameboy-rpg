// Package store 提供玩家進度的檔案持久化 (implements game.Store)
package store

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/bizshuk/game1/game"
)

// File 以單一 JSON 檔保存全部玩家進度。
// 記憶體為權威來源，每次 Save 全量寫檔 (原子 rename)；demo 規模足夠。
type File struct {
	path string
	mu   sync.Mutex
	data map[string]game.Progress
}

// NewFile 開啟 (或建立) 存檔；讀檔失敗時退回空存檔並記錄
func NewFile(path string) (*File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	f := &File{path: path, data: map[string]game.Progress{}}
	b, err := os.ReadFile(path)
	switch {
	case os.IsNotExist(err):
		return f, nil
	case err != nil:
		return nil, err
	}
	if err := json.Unmarshal(b, &f.data); err != nil {
		slog.Error("save file corrupt, starting fresh",
			"err", err, "path", path, "bytes", len(b))
		f.data = map[string]game.Progress{}
	}
	return f, nil
}

// Load 讀取指定玩家進度
func (f *File) Load(name string) (game.Progress, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.data[name]
	return p, ok
}

// Save 寫入進度並落盤 (寫暫存檔後 rename, 避免半寫毀檔)
func (f *File) Save(p game.Progress) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.data[p.Name] = p
	b, err := json.MarshalIndent(f.data, "", "  ")
	if err != nil {
		slog.Error("marshal save data failed", "err", err, "player", p.Name, "count", len(f.data))
		return
	}
	tmp := f.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		slog.Error("write save temp failed", "err", err, "path", tmp, "player", p.Name)
		return
	}
	if err := os.Rename(tmp, f.path); err != nil {
		slog.Error("rename save file failed", "err", err, "path", f.path, "player", p.Name)
	}
}

// Count 目前存檔筆數 (啟動記錄用)
func (f *File) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.data)
}
