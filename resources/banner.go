package resources

import (
	"fmt"
	"io"
	"strings"
	"unicode"

	"github.com/navidrome/navidrome/consts"
)

func loadBanner() string {
	f, err := embedFS.Open("banner.txt")
	if err != nil {
		return ""
	}
	data, _ := io.ReadAll(f)
	return strings.TrimRightFunc(string(data), unicode.IsSpace)
}

func Banner() string {
	version := "Version " + consts.CisumVersion + " (based on Navidrome " + consts.Version + ")"
	return fmt.Sprintf("%s\n%s\n", loadBanner(), version)
}
