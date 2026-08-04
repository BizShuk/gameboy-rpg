package server

// integration_test.go — 起 httptest server, 用 ws client 走一遍 join/移動/攻擊/購買

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/bizshuk/game1/game"
	"github.com/gorilla/websocket"
)

type anyMsg map[string]any

// clientView 模擬 client 的本地實體表: 套用 delta 快照 (含 keyframe 與移除清單)
type clientView struct {
	players  map[float64]map[string]any
	monsters map[float64]map[string]any
}

func newClientView() *clientView {
	return &clientView{
		players:  map[float64]map[string]any{},
		monsters: map[float64]map[string]any{},
	}
}

func (v *clientView) apply(m anyMsg) {
	upsert := func(dst map[float64]map[string]any, list any) {
		for _, e := range asList(list) {
			em := e.(map[string]any)
			dst[em["id"].(float64)] = em
		}
	}
	if key, _ := m["key"].(bool); key { // keyframe: 未列出者代表已離場
		alive := map[float64]bool{}
		for _, e := range asList(m["p"]) {
			alive[e.(map[string]any)["id"].(float64)] = true
		}
		for id := range v.players {
			if !alive[id] {
				delete(v.players, id)
			}
		}
		aliveM := map[float64]bool{}
		for _, e := range asList(m["m"]) {
			aliveM[e.(map[string]any)["id"].(float64)] = true
		}
		for id := range v.monsters {
			if !aliveM[id] {
				delete(v.monsters, id)
			}
		}
	} else {
		for _, id := range asList(m["rp"]) {
			delete(v.players, id.(float64))
		}
		for _, id := range asList(m["rm"]) {
			delete(v.monsters, id.(float64))
		}
	}
	upsert(v.players, m["p"])
	upsert(v.monsters, m["m"])
}

// asList 取出 JSON 陣列 (缺欄位視為空)
func asList(v any) []any {
	l, _ := v.([]any)
	return l
}

func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c
}

func readUntil(t *testing.T, c *websocket.Conn, typ string, timeout time.Duration) anyMsg {
	t.Helper()
	deadline := time.Now().Add(timeout)
	c.SetReadDeadline(deadline)
	for time.Now().Before(deadline) {
		_, b, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("read waiting for %q: %v", typ, err)
		}
		var m anyMsg
		if err := json.Unmarshal(b, &m); err != nil {
			continue
		}
		if m["t"] == typ {
			return m
		}
	}
	t.Fatalf("no %q message within %v", typ, timeout)
	return nil
}

func TestWebSocketGameplay(t *testing.T) {
	hub := NewHub(game.NewWorld())
	go hub.Run()
	static := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("ok")}}
	srv := httptest.NewServer(Routes(hub, static))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	// 玩家 A 入場
	a := dial(t, wsURL)
	defer a.Close()
	a.WriteJSON(map[string]any{"t": "join", "name": "Alice"})
	init := readUntil(t, a, "init", 2*time.Second)
	if init["id"] == nil || init["rows"] == nil {
		t.Fatalf("bad init: %v", init)
	}
	aID := init["id"].(float64)

	// 玩家 B 入場後, A 的快照應看到兩人
	b := dial(t, wsURL)
	defer b.Close()
	b.WriteJSON(map[string]any{"t": "join", "name": "Bob"})
	readUntil(t, b, "init", 2*time.Second)

	// 模擬真實 client: 逐幀套用 delta 快照後維護本地實體表
	view := newClientView()
	for range 40 {
		view.apply(readUntil(t, a, "st", 2*time.Second))
		if len(view.players) == 2 {
			break
		}
	}
	if n := len(view.players); n != 2 {
		t.Fatalf("players after delta apply = %d, want 2", n)
	}
	if len(view.monsters) == 0 {
		t.Fatal("no monsters after delta apply")
	}

	// A 按住右移 → x 增加
	getA := func() map[string]any {
		pm, ok := view.players[aID]
		if !ok {
			t.Fatal("player A missing from client view")
		}
		return pm
	}
	x0 := getA()["x"].(float64)
	a.WriteJSON(map[string]any{"t": "in", "rt": true})
	time.Sleep(300 * time.Millisecond)
	a.WriteJSON(map[string]any{"t": "in"})
	view.apply(readUntil(t, a, "st", 2*time.Second))
	if x1 := getA()["x"].(float64); x1 <= x0 {
		t.Errorf("player did not move right: %v -> %v", x0, x1)
	}

	// A 攻擊 → 收到 slash 事件
	a.WriteJSON(map[string]any{"t": "atk"})
	found := false
	for range 40 {
		st := readUntil(t, a, "st", 2*time.Second)
		view.apply(st)
		if evs, ok := st["e"].([]any); ok {
			for _, e := range evs {
				if e.(map[string]any)["k"] == "sl" {
					found = true
				}
			}
		}
		if found {
			break
		}
	}
	if !found {
		t.Error("no slash event after atk")
	}

	// 離櫃檯太遠買東西 → 拒絕訊息
	a.WriteJSON(map[string]any{"t": "buy", "id": "potion"})
	msg := readUntil(t, a, "msg", 2*time.Second)
	if !strings.Contains(msg["txt"].(string), "counter") {
		t.Errorf("unexpected buy reply: %v", msg["txt"])
	}

	// B 斷線 → delta 的 rp 清單讓 A 的本地表回到 1 人
	b.Close()
	ok := false
	for range 60 {
		view.apply(readUntil(t, a, "st", 2*time.Second))
		if len(view.players) == 1 {
			ok = true
			break
		}
	}
	if !ok {
		t.Error("player B not removed after disconnect")
	}
}
