package persistence

import (
	"github.com/deluan/rest"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// Cisum: administrators only see in lists the playlists visible to them as a regular user.
var _ = Describe("Cisum playlist lists for administrators", func() {
	It("hides other people's private playlists from admin lists, except with admin_all", func() {
		repo := NewPlaylistRepository(GetDBXBuilder())
		ownerCtx := request.WithUser(log.NewContext(GinkgoT().Context()), regularUser)
		adminCtx := request.WithUser(log.NewContext(GinkgoT().Context()), adminUser)

		private := model.Playlist{Name: "Cisum private of regular", OwnerID: regularUser.ID, Public: false}
		Expect(repo.Put(ownerCtx, &private)).To(Succeed())
		public := model.Playlist{Name: "Cisum public of regular", OwnerID: regularUser.ID, Public: true}
		Expect(repo.Put(ownerCtx, &public)).To(Succeed())
		DeferCleanup(func() {
			_ = repo.Delete(adminCtx, private.ID)
			_ = repo.Delete(adminCtx, public.ID)
		})

		listed, err := repo.ReadAll(adminCtx)
		Expect(err).ToNot(HaveOccurred())
		Expect(listed).ToNot(ContainElement(HaveField("ID", private.ID)))
		Expect(listed).To(ContainElement(HaveField("ID", public.ID)))
		count, err := repo.Count(adminCtx)
		Expect(err).ToNot(HaveOccurred())
		Expect(count).To(Equal(int64(len(listed))))

		all, err := repo.ReadAll(adminCtx, rest.QueryOptions{Filters: map[string]any{"admin_all": "true"}})
		Expect(err).ToNot(HaveOccurred())
		Expect(all).To(ContainElement(HaveField("ID", private.ID)))

		// Still manageable by id
		pls, err := repo.Get(adminCtx, private.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(pls.Name).To(Equal(private.Name))

		// admin_all gives nothing more to a regular user
		third := request.WithUser(log.NewContext(GinkgoT().Context()), thirdUser)
		res, err := repo.ReadAll(third, rest.QueryOptions{Filters: map[string]any{"admin_all": "true"}})
		Expect(err).ToNot(HaveOccurred())
		Expect(res).ToNot(ContainElement(HaveField("ID", private.ID)))
	})
})
