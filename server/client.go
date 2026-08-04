package server

// client.go — 單一 WebSocket 連線的收發 pump

import (
	"encoding/json"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 5 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 45 * time.Second
	maxMsgSize = 512
)

// Client 一條連線；playerID 於 join 後由 Hub goroutine 設定
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	playerID int64
	name     string
}

// sendJSON 序列化後排入送出佇列 (滿了直接丟棄)
func (c *Client) sendJSON(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		slog.Error("marshal outbound failed", "err", err, "player_id", c.playerID, "name", c.name)
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

// readPump 讀取上行訊息轉交 Hub；連線關閉時通知 unregister
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var m ClientMsg
		if err := json.Unmarshal(data, &m); err != nil {
			continue // 格式錯誤直接忽略
		}
		c.hub.inbox <- inbound{c: c, m: m}
	}
}

// writePump 送出佇列 + 心跳 ping
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case b, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
