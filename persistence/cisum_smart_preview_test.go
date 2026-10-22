// Cisum v0.10.0 - Tests of the dynamic playlist preview.
package persistence

import (
	"context"

	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/criteria"
	"github.com/navidrome/navidrome/model/request"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("PlaylistRepository - Cisum smart playlist preview", func() {
	var repo model.PlaylistRepository
	var ctx context.Context

	BeforeEach(func() {
		ctx = request.WithUser(log.NewContext(GinkgoT().Context()), model.User{ID: "userid", UserName: "userid", IsAdmin: true})
		repo = NewPlaylistRepository(GetDBXBuilder())
	})

	// The preview must return what a real refresh puts in the playlist
	matchesRefresh := func(rules criteria.Criteria) {
		count, ids, err := repo.PreviewSmartPlaylist(ctx, rules, 100)
		Expect(err).ToNot(HaveOccurred())

		pls := model.Playlist{Name: "Preview check", OwnerID: "userid", Rules: &rules}
		Expect(repo.Put(ctx, &pls)).To(Succeed())
		DeferCleanup(func() { _ = repo.Delete(ctx, pls.ID) })
		refreshed, err := repo.GetWithTracks(ctx, pls.ID, true, true)
		Expect(err).ToNot(HaveOccurred())

		refreshedIDs := make([]string, len(refreshed.Tracks))
		for i, t := range refreshed.Tracks {
			refreshedIDs[i] = t.MediaFileID
		}
		Expect(count).To(BeEquivalentTo(len(refreshedIDs)))
		Expect(ids).To(Equal(refreshedIDs))
	}

	It("matches a refresh without limit", func() {
		matchesRefresh(criteria.Criteria{Expression: criteria.All{criteria.Gt{"duration": 0}}, Sort: "title"})
	})

	It("matches a refresh with a limit and a descending sort", func() {
		matchesRefresh(criteria.Criteria{Expression: criteria.Any{criteria.Gt{"duration": 0}}, Sort: "-year,title", Limit: 2})
	})

	It("caps the returned ids but still reports the full count", func() {
		rules := criteria.Criteria{Expression: criteria.All{criteria.Gt{"duration": 0}}}
		count, ids, err := repo.PreviewSmartPlaylist(ctx, rules, 1)
		Expect(err).ToNot(HaveOccurred())
		Expect(count).To(BeNumerically(">", 1))
		Expect(ids).To(HaveLen(1))
	})

	It("reports invalid rules", func() {
		rules := criteria.Criteria{Expression: criteria.All{criteria.Is{"nosuchfield": "x"}}}
		_, _, err := repo.PreviewSmartPlaylist(ctx, rules, 10)
		Expect(err).To(HaveOccurred())
	})
})
