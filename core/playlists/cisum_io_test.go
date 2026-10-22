package playlists

import (
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Cisum M3U import parsing", func() {
	It("reads name, EXTINF metadata and paths", func() {
		name, entries, err := parseM3UEntries(strings.NewReader("\uFEFF#EXTM3U\n#PLAYLIST:Road trip\n" +
			"#EXTINF:183,Mira Sol - Tide - Live\nD:\\Music\\Mira Sol\\Tide.flac\n" +
			"file:///music/a%20b.mp3\n"))
		Expect(err).ToNot(HaveOccurred())
		Expect(name).To(Equal("Road trip"))
		Expect(entries).To(HaveLen(2))
		Expect(entries[0]).To(Equal(m3uEntry{path: `D:\Music\Mira Sol\Tide.flac`, artist: "Mira Sol", title: "Tide - Live", duration: 183}))
		Expect(entries[1].path).To(Equal("/music/a b.mp3"))
		Expect(entries[1].title).To(BeEmpty())
	})

	It("builds safe and unique file names", func() {
		used := map[string]int{}
		Expect(UniqueName(used, SafeFileName("Rock/Pop: best?"))).To(Equal("Rock_Pop_ best_"))
		Expect(UniqueName(used, SafeFileName("rock/pop: best?"))).To(Equal("rock_pop_ best_ (2)"))
		Expect(SafeFileName("  ")).To(Equal("playlist"))
	})
})
