// Package webui embeds the Cisum web player build (served at /web).
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:build
var filesystem embed.FS

func BuildAssets() fs.FS {
	build, _ := fs.Sub(filesystem, "build")
	return build
}
