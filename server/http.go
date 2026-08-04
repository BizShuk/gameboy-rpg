package server

// http.go — HTTP 路由：靜態頁面 + /ws 升級

import (
	"io/fs"
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	// demo 用途：允許任意來源 (LAN 內多人連線)
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Routes 建立路由；static 為 client 靜態檔案 (web.FS)
func Routes(h *Hub, static fs.FS) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServerFS(static))
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Warn("ws upgrade failed", "err", err, "remote", r.RemoteAddr, "path", r.URL.Path)
			return
		}
		c := &Client{hub: h, conn: conn, send: make(chan []byte, 64)}
		h.register <- c
		go c.writePump()
		go c.readPump()
	})
	return mux
}
