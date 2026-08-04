package server

// hub.go — 連線集散與遊戲主迴圈 (single goroutine owns World)

import (
	"encoding/json"
	"log/slog"
	"time"

	"github.com/bizshuk/gameboy-rpg/game"
)

// autosaveEvery 自動存檔間隔 (ticks; 20Hz → 30s)
const autosaveEvery = 30 * game.TickRate

// inbound 客戶端訊息 + 來源
type inbound struct {
	c *Client
	m ClientMsg
}

// Hub 管理所有連線；world 只在 Run goroutine 內讀寫，避免鎖
type Hub struct {
	world      *game.World
	clients    map[*Client]bool
	byPlayer   map[int64]*Client
	register   chan *Client
	unregister chan *Client
	inbox      chan inbound
	autosave   int // 自動存檔倒數 (ticks)
	delta      *deltaState
}

// NewHub 建立 Hub
func NewHub(w *game.World) *Hub {
	return &Hub{
		world:      w,
		clients:    map[*Client]bool{},
		byPlayer:   map[int64]*Client{},
		register:   make(chan *Client, 8),
		unregister: make(chan *Client, 8),
		inbox:      make(chan inbound, 256),
		delta:      newDeltaState(),
	}
}

// drainOutbox 轉發世界產生的 per-player 訊息 (劇情橫幅/對話/提示)
func (h *Hub) drainOutbox() {
	for _, pm := range h.world.PopOutbox() {
		c, ok := h.byPlayer[pm.PID]
		if !ok {
			continue
		}
		switch pm.Kind {
		case "dlg":
			c.sendJSON(DlgMsg{T: "dlg", Dlg: *pm.Dlg})
		default: // msg / qmsg
			c.sendJSON(TextMsg{T: pm.Kind, Txt: pm.Txt})
		}
	}
}

// Run 主迴圈：20Hz tick + 訊息處理；需以 goroutine 啟動
func (h *Hub) Run() {
	ticker := time.NewTicker(time.Second / game.TickRate)
	defer ticker.Stop()
	for {
		select {
		case c := <-h.register:
			h.clients[c] = true
		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				if c.playerID != 0 {
					delete(h.byPlayer, c.playerID)
					h.world.SavePlayer(c.playerID) // 先存檔再移除
					h.world.RemovePlayer(c.playerID)
					slog.Info("player left", "player_id", c.playerID, "name", c.name, "online", h.world.PlayerCount())
				}
				close(c.send)
			}
		case in := <-h.inbox:
			h.handle(in.c, in.m)
			h.drainOutbox()
		case <-ticker.C:
			h.world.Tick()
			h.drainOutbox()
			h.broadcast()
			h.autosave++
			if h.autosave >= autosaveEvery { // 定期存檔: 伺服器被 kill 也保住進度
				h.autosave = 0
				for pid := range h.byPlayer {
					h.world.SavePlayer(pid)
				}
			}
		}
	}
}

// handle 處理單一上行訊息
func (h *Hub) handle(c *Client, m ClientMsg) {
	switch m.T {
	case "join":
		if c.playerID != 0 {
			return
		}
		name := sanitizeName(m.Name)
		p := h.world.AddPlayer(name)
		c.playerID = p.ID
		c.name = name
		h.byPlayer[p.ID] = c
		h.delta.forceKeyframe() // 新玩家需要一份全量才能建表
		mp := h.world.Map
		safes := make([][4]int, 0, len(mp.Safes))
		for _, r := range mp.Safes {
			safes = append(safes, [4]int{r.X1, r.Y1, r.X2, r.Y2})
		}
		c.sendJSON(InitMsg{
			T: "init", ID: p.ID, Tile: game.TileSize,
			W: mp.W, H: mp.H, Rows: mp.Rows,
			Safe:  safes,
			DTop:  mp.DungeonTopRow(),
			VTop:  mp.VoidTopRow(),
			Shop:  game.ShopItems,
			Kinds: game.Kinds,
			NPCs:  game.NPCs,
			Story: game.Stages,
		})
		slog.Info("player joined", "player_id", p.ID, "name", name, "online", h.world.PlayerCount())
	case "in":
		if c.playerID != 0 {
			h.world.SetInput(c.playerID, game.Input{Up: m.Up, Down: m.Dn, Left: m.Lf, Right: m.Rt})
		}
	case "atk":
		if c.playerID != 0 {
			h.world.Attack(c.playerID)
		}
	case "buy":
		if c.playerID != 0 {
			if txt := h.world.Buy(c.playerID, m.ID); txt != "" {
				c.sendJSON(TextMsg{T: "msg", Txt: txt})
			}
		}
	case "use":
		if c.playerID != 0 {
			itemID := m.ID
			if itemID == "" {
				itemID = "potion"
			}
			if txt := h.world.UseItem(c.playerID, itemID); txt != "" {
				c.sendJSON(TextMsg{T: "msg", Txt: txt})
			}
		}
	case "pvp":
		if c.playerID != 0 {
			if txt := h.world.TogglePvP(c.playerID); txt != "" {
				c.sendJSON(TextMsg{T: "msg", Txt: txt})
			}
		}
	case "talk":
		if c.playerID != 0 {
			if d := h.world.TalkNPC(c.playerID, m.ID); d != nil {
				c.sendJSON(DlgMsg{T: "dlg", Dlg: *d})
			}
		}
	case "dlgact":
		if c.playerID != 0 {
			if d := h.world.DialogAction(c.playerID, m.ID); d != nil {
				c.sendJSON(DlgMsg{T: "dlg", Dlg: *d})
			}
		}
	}
}

// broadcast 對所有已入場連線送出快照；壅塞時丟幀
func (h *Hub) broadcast() {
	anyJoined := false
	for c := range h.clients {
		if c.playerID != 0 {
			anyJoined = true
			break
		}
	}
	if !anyJoined {
		// 仍要清事件緩衝，避免無人時堆積
		h.world.Snapshot()
		return
	}
	b, err := json.Marshal(h.delta.build(h.world.Snapshot()))
	if err != nil {
		slog.Error("marshal state failed", "err", err, "online", h.world.PlayerCount(), "tick", "broadcast")
		return
	}
	for c := range h.clients {
		if c.playerID == 0 {
			continue
		}
		select {
		case c.send <- b:
		default: // 慢客戶端：丟掉本幀，下一幀會覆蓋
		}
	}
}

// sanitizeName 名稱長度限制與預設值
func sanitizeName(s string) string {
	rs := []rune(s)
	if len(rs) > 12 {
		rs = rs[:12]
	}
	out := string(rs)
	if out == "" {
		out = "Trainer"
	}
	return out
}
