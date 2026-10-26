// Cisum v0.11.8 - Tests of the extra tags (MediaMonkey Custom 1-10 and free tags).
package model

import (
	"os"
	"path/filepath"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/conf/configtest"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Cisum tags", func() {
	// File tag names already read by other tags
	index := map[string]string{"mood": "mood", "tmoo": "mood"}
	tagOf := func(alias string) (string, bool) {
		owner, ok := index[alias]
		return owner, ok
	}

	BeforeEach(func() {
		reservedTagNames = map[string]struct{}{"mood": {}, "title": {}}
		activeCustomTags = nil
	})

	It("maps Custom 1-10 to the MediaMonkey file tag names", func() {
		tags := MediaMonkeyCustomTags()
		Expect(tags).To(HaveLen(10))
		Expect(tags[0].Aliases).To(Equal([]string{"custom1", "comment:songs-db_custom1"}))
		Expect(tags[9].Name).To(Equal("custom10"))
	})

	It("normalizes names, aliases and labels", func() {
		out, err := validateCisumTags(CisumTags{
			Tags:   []CustomTag{{Name: " Energy ", Aliases: []string{"ENERGY", "energy", " "}}, {Name: "score", Type: "float"}},
			Labels: map[string]string{"energy": " Energy level ", "custom1": "Occasion", "gone": "x", "score": ""},
		}, tagOf)
		Expect(err).ToNot(HaveOccurred())
		Expect(out.Tags).To(Equal([]CustomTag{{Name: "energy", Aliases: []string{"energy"}}, {Name: "score", Aliases: []string{"score"}, Type: "float"}}))
		Expect(out.Labels).To(Equal(map[string]string{"energy": "Energy level", "custom1": "Occasion"}))
	})

	DescribeTable("refuses invalid tags",
		func(tag CustomTag) {
			_, err := validateCisumTags(CisumTags{Tags: []CustomTag{tag}}, tagOf)
			Expect(err).To(BeAssignableToTypeOf(ValidationError{}))
		},
		Entry("bad name", CustomTag{Name: "my tag"}),
		Entry("name starting with a digit", CustomTag{Name: "1tag"}),
		Entry("mappings.yaml tag", CustomTag{Name: "mood"}),
		Entry("criteria field", CustomTag{Name: "title"}),
		Entry("built-in custom tag", CustomTag{Name: "custom3"}),
		Entry("alias of another tag", CustomTag{Name: "feeling", Aliases: []string{"tmoo"}}),
		Entry("alias of a built-in tag", CustomTag{Name: "feeling", Aliases: []string{"comment:songs-db_custom2"}}),
		Entry("unknown type", CustomTag{Name: "feeling", Type: "date"}),
	)

	It("refuses the same name twice", func() {
		_, err := validateCisumTags(CisumTags{Tags: []CustomTag{{Name: "a"}, {Name: "A"}}}, tagOf)
		Expect(err).To(HaveOccurred())
	})

	It("tells when a restart is needed", func() {
		activeCustomTags = []CustomTag{{Name: "energy", Aliases: []string{"energy"}}}
		Expect(CustomTagsRestartRequired([]CustomTag{{Name: "energy", Aliases: []string{"energy"}}})).To(BeFalse())
		Expect(CustomTagsRestartRequired([]CustomTag{{Name: "energy", Aliases: []string{"nrg"}}})).To(BeTrue())
		Expect(CustomTagsRestartRequired(nil)).To(BeTrue())
	})

	Describe("addCisumTagMappings", func() {
		BeforeEach(func() {
			DeferCleanup(configtest.SetupConfig())
			conf.Server.DataFolder = conf.NewDir(GinkgoT().TempDir())
		})

		It("adds the built-in and the saved free tags", func() {
			data := `{"tags":[{"name":"energy","aliases":["energy","comment:songs-db_energy"]},{"name":"mood2","aliases":["tmoo"]}]}`
			Expect(os.WriteFile(filepath.Join(conf.Server.DataFolder.String(), CisumTagsFileName), []byte(data), 0600)).To(Succeed())
			m := mappingsConf{Main: tagMappings{"mood": {Aliases: []string{"tmoo", "mood"}}}}
			addCisumTagMappings(&m)
			// mood2 reuses a file tag name of mood: the file is invalid and the free tags are ignored
			Expect(m.Additional).To(HaveKey(TagName("custom1")))
			Expect(m.Additional).ToNot(HaveKey(TagName("energy")))
			Expect(ActiveCustomTags()).To(BeEmpty())

			data = `{"tags":[{"name":"energy","aliases":["energy","comment:songs-db_energy"],"type":"float"}]}`
			Expect(os.WriteFile(filepath.Join(conf.Server.DataFolder.String(), CisumTagsFileName), []byte(data), 0600)).To(Succeed())
			m = mappingsConf{Main: tagMappings{"mood": {Aliases: []string{"tmoo", "mood"}}}}
			addCisumTagMappings(&m)
			Expect(m.Additional).To(HaveKey(TagName("energy")))
			Expect(m.Additional[TagName("energy")].Type).To(Equal(TagTypeFloat))
			Expect(ActiveCustomTags()).To(HaveLen(1))
			Expect(IsCustomTag("energy")).To(BeTrue())
			Expect(IsCustomTag("custom7")).To(BeTrue())
			Expect(IsCustomTag("mood")).To(BeFalse())
		})
	})
})
