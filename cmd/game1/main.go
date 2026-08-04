// game1 — Pokemon 風格多人連線動作 RPG demo server
package main

import (
	"flag"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/bizshuk/game1/game"
	"github.com/bizshuk/game1/server"
	"github.com/bizshuk/game1/store"
	"github.com/bizshuk/game1/web"
	"github.com/bizshuk/gosdk/config"
	"github.com/spf13/viper"
)

const appName = "game1"

func main() {
	// 設定優先序: flag > 環境變數 (APP_ADDR/APP_SAVE) > ~/.config/game1/*.yaml > 預設
	config.Default(config.WithAppName(appName))
	viper.SetDefault("addr", ":8470")
	viper.SetDefault("save", filepath.Join(config.GetAppConfigDir(), "data", "players.json"))

	addr := flag.String("addr", "", "listen address, e.g. :8470 (overrides config)")
	save := flag.String("save", "", `progress save file ("-" to disable, overrides config)`)
	flag.Parse()

	listen := firstNonEmpty(*addr, portEnvAddr(), viper.GetString("addr"))
	savePath := firstNonEmpty(*save, viper.GetString("save"))

	w := game.NewWorld()
	if savePath != "" && savePath != "-" {
		fs, err := store.NewFile(savePath)
		if err != nil {
			slog.Error("open save file failed, progress will not persist",
				"err", err, "path", savePath, "component", "store")
		} else {
			w.SetStore(fs)
			slog.Info("progress persistence enabled", "path", savePath, "saved_players", fs.Count())
		}
	}

	hub := server.NewHub(w)
	go hub.Run()

	slog.Info("game1 server listening",
		"addr", listen, "url", "http://localhost"+listen, "config_dir", config.GetAppConfigDir())
	if err := http.ListenAndServe(listen, server.Routes(hub, web.FS())); err != nil {
		slog.Error("server exited", "err", err, "addr", listen, "component", "http")
		os.Exit(1)
	}
}

// portEnvAddr 相容既有的 PORT 環境變數
func portEnvAddr() string {
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return ""
}

// firstNonEmpty 取第一個非空字串
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
