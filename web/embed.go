// Package web 內嵌 client 靜態檔案 (embedded static assets)
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:static
var staticFS embed.FS

// FS 回傳以 static/ 為根的檔案系統
func FS() fs.FS {
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(err)
	}
	return sub
}
