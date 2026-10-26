// Cisum v0.11.8 - Extra tags read by the scanner and usable in dynamic playlist rules:
//   - MediaMonkey Custom 1 to 10, always read (MP3: comment "Songs-DB_CustomN"; FLAC, M4A, TXXX: "CUSTOMN");
//   - free tags added from the administration page.
//
// Free tags and the field labels are stored in <DataFolder>/cisum-tags.json. Tags are loaded once at start-up,
// with mappings.yaml: adding or removing one needs a restart, then a full scan. Labels apply at once.
package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model/criteria"
)

const (
	CisumTagsFileName       = "cisum-tags.json"
	MediaMonkeyCustomFields = 10
	CustomTagsMax           = 50
	CustomTagAliasesMax     = 10
	CustomTagLabelMax       = 40
	customTagAliasMaxLength = 100
	customTagValueMaxLength = 1024
)

// CustomTag is one extra tag. Aliases are the tag names looked up in the files (lowercase); empty = the name.
// Type is "" (text) or "float" (number: numeric comparisons in rules).
type CustomTag struct {
	Name    string   `json:"name"`
	Aliases []string `json:"aliases,omitempty"`
	Type    string   `json:"type,omitempty"`
}

// CisumTags is the content of cisum-tags.json. Labels: tag name -> name shown in the rules editor.
type CisumTags struct {
	Tags   []CustomTag       `json:"tags"`
	Labels map[string]string `json:"labels,omitempty"`
}

var (
	customTagNameRx = regexp.MustCompile(`^[a-z][a-z0-9_]{0,39}$`)
	cisumTagsMu     sync.Mutex
	// Set once at start-up by addCisumTagMappings, read-only afterwards
	activeCustomTags []CustomTag
	reservedTagNames = map[string]struct{}{}
)

// MediaMonkeyCustomTags returns the built-in Custom 1 to 10 tags.
func MediaMonkeyCustomTags() []CustomTag {
	tags := make([]CustomTag, 0, MediaMonkeyCustomFields)
	for i := 1; i <= MediaMonkeyCustomFields; i++ {
		tags = append(tags, CustomTag{
			Name:    fmt.Sprintf("custom%d", i),
			Aliases: []string{fmt.Sprintf("custom%d", i), fmt.Sprintf("comment:songs-db_custom%d", i)},
		})
	}
	return tags
}

// IsMediaMonkeyCustomTag tells whether name is one of the built-in custom1 to custom10 tags.
func IsMediaMonkeyCustomTag(name string) bool {
	return slices.ContainsFunc(MediaMonkeyCustomTags(), func(t CustomTag) bool { return t.Name == name })
}

// ActiveCustomTags returns the free tags loaded at start-up (the built-in ones are not included).
func ActiveCustomTags() []CustomTag {
	return slices.Clone(activeCustomTags)
}

// IsCustomTag tells whether name is a built-in or an active free tag.
func IsCustomTag(name string) bool {
	return IsMediaMonkeyCustomTag(name) || slices.ContainsFunc(activeCustomTags, func(t CustomTag) bool { return t.Name == name })
}

func cisumTagsPath() string {
	folder := conf.Server.DataFolder.String()
	if folder == "" {
		return ""
	}
	return filepath.Join(folder, CisumTagsFileName)
}

// LoadCisumTags reads cisum-tags.json. A missing file is not an error (no free tag, no label).
func LoadCisumTags() (CisumTags, error) {
	cisumTagsMu.Lock()
	defer cisumTagsMu.Unlock()
	return readCisumTags()
}

func readCisumTags() (CisumTags, error) {
	var t CisumTags
	path := cisumTagsPath()
	if path == "" {
		return t, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return t, nil
	}
	if err != nil {
		return t, err
	}
	if err := json.Unmarshal(data, &t); err != nil {
		return t, fmt.Errorf("invalid %s: %w", CisumTagsFileName, err)
	}
	return t, nil
}

// SaveCisumTags validates and writes cisum-tags.json (temporary file then rename). Returns the saved content.
func SaveCisumTags(t CisumTags) (CisumTags, error) {
	cleaned, err := ValidateCisumTags(t)
	if err != nil {
		return t, err
	}
	path := cisumTagsPath()
	if path == "" {
		return t, errors.New("data folder not configured")
	}
	data, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return t, err
	}
	cisumTagsMu.Lock()
	defer cisumTagsMu.Unlock()
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return t, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return t, err
	}
	return cleaned, nil
}

// ValidationError is returned for invalid user input (answered with 400).
type ValidationError struct{ msg string }

func (e ValidationError) Error() string { return e.msg }

func invalid(format string, args ...any) error { return ValidationError{fmt.Sprintf(format, args...)} }

// ValidateCisumTags normalizes the free tags and labels and checks them:
// names [a-z][a-z0-9_] (max 40), not a tag of mappings.yaml or of the configuration file, not a criteria field,
// aliases unique and not used by another tag, labels only for custom tags.
func ValidateCisumTags(t CisumTags) (CisumTags, error) {
	return validateCisumTags(t, func(alias string) (string, bool) {
		owner, ok := CanonicalTagName(alias)
		return string(owner), ok
	})
}

// validateCisumTags does the work of ValidateCisumTags. tagOf returns the tag a file tag name is read as
// (it must not trigger the loading of the mappings while they are being built).
func validateCisumTags(t CisumTags, tagOf func(alias string) (string, bool)) (CisumTags, error) {
	out := CisumTags{Tags: []CustomTag{}, Labels: map[string]string{}}
	if len(t.Tags) > CustomTagsMax {
		return out, invalid("at most %d free tags", CustomTagsMax)
	}
	names := map[string]struct{}{}
	aliasOwner := map[string]string{}
	for _, b := range MediaMonkeyCustomTags() {
		for _, a := range b.Aliases {
			aliasOwner[a] = b.Name
		}
	}
	for _, tag := range t.Tags {
		name := strings.ToLower(strings.TrimSpace(tag.Name))
		if !customTagNameRx.MatchString(name) {
			return out, invalid("invalid tag name %q: use lowercase letters, digits and _ (start with a letter, max 40)", tag.Name)
		}
		if _, dup := names[name]; dup {
			return out, invalid("tag %q is listed twice", name)
		}
		if IsMediaMonkeyCustomTag(name) || isReservedTagName(name) {
			return out, invalid("%q is already a tag or field of Cisum", name)
		}
		names[name] = struct{}{}
		typ := strings.TrimSpace(tag.Type)
		if typ != "" && typ != string(TagTypeFloat) {
			return out, invalid("invalid type %q for tag %q", tag.Type, name)
		}
		var aliases []string
		for _, a := range tag.Aliases {
			a = strings.ToLower(strings.TrimSpace(a))
			if a == "" || slices.Contains(aliases, a) {
				continue
			}
			if len(a) > customTagAliasMaxLength {
				return out, invalid("file tag name too long for %q", name)
			}
			aliases = append(aliases, a)
		}
		if len(aliases) == 0 {
			aliases = []string{name}
		}
		if len(aliases) > CustomTagAliasesMax {
			return out, invalid("at most %d file tag names for %q", CustomTagAliasesMax, name)
		}
		for _, a := range aliases {
			if owner, used := aliasOwner[a]; used && owner != name {
				return out, invalid("file tag name %q is used by %q and %q", a, owner, name)
			}
			if owner, used := tagOf(a); used && owner != name && !IsCustomTag(owner) {
				return out, invalid("file tag name %q is already read as %q", a, owner)
			}
			aliasOwner[a] = name
		}
		out.Tags = append(out.Tags, CustomTag{Name: name, Aliases: aliases, Type: typ})
	}
	for name, label := range t.Labels {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		if _, free := names[name]; !free && !IsMediaMonkeyCustomTag(name) {
			continue // label of a removed tag
		}
		if len([]rune(label)) > CustomTagLabelMax {
			return out, invalid("label of %q too long (max %d characters)", name, CustomTagLabelMax)
		}
		out.Labels[name] = label
	}
	return out, nil
}

// CustomTagsRestartRequired tells whether the saved free tags differ from the ones loaded at start-up.
func CustomTagsRestartRequired(saved []CustomTag) bool {
	return !slices.EqualFunc(saved, activeCustomTags, func(a, b CustomTag) bool {
		return a.Name == b.Name && a.Type == b.Type && slices.Equal(a.Aliases, b.Aliases)
	})
}

// criteriaFieldNames returns the dynamic playlist fields that are not tags or roles (title, rating, path...).
func criteriaFieldNames() []string {
	var names []string
	for _, name := range criteria.AllFieldNames() {
		if info, ok := criteria.LookupField(name); ok && !info.IsTag && !info.IsRole {
			names = append(names, strings.ToLower(name))
		}
	}
	return names
}

func isReservedTagName(name string) bool {
	_, ok := reservedTagNames[name]
	return ok
}

// addCisumTagMappings adds the built-in and the free tags to the additional mappings. Called by
// loadTagMappings after mappings.yaml is decoded and before the configuration file overrides (Tags option).
func addCisumTagMappings(m *mappingsConf) {
	if m.Additional == nil {
		m.Additional = tagMappings{}
	}
	// Names that free tags cannot take: mappings.yaml, the configuration file, the criteria fields
	reservedTagNames = map[string]struct{}{}
	for name := range m.Main {
		reservedTagNames[strings.ToLower(string(name))] = struct{}{}
	}
	for name := range m.Additional {
		reservedTagNames[strings.ToLower(string(name))] = struct{}{}
	}
	for name := range conf.Server.Tags {
		reservedTagNames[strings.ToLower(name)] = struct{}{}
	}
	for _, name := range criteriaFieldNames() {
		reservedTagNames[name] = struct{}{}
	}

	add := func(t CustomTag) bool {
		name := TagName(t.Name)
		if _, exists := m.Main[name]; exists {
			log.Warn("Cisum tag skipped: already defined in mappings.yaml", "tag", t.Name)
			return false
		}
		if _, exists := m.Additional[name]; exists {
			log.Warn("Cisum tag skipped: already defined in mappings.yaml", "tag", t.Name)
			return false
		}
		m.Additional[name] = TagConf{Aliases: t.Aliases, Type: TagType(t.Type), MaxLength: customTagValueMaxLength}
		return true
	}
	for _, t := range MediaMonkeyCustomTags() {
		add(t)
	}

	activeCustomTags = nil
	saved, err := readCisumTags()
	if err != nil {
		log.Error("Error reading Cisum free tags, they are ignored", "file", cisumTagsPath(), err)
		return
	}
	// Index of the file tag names already mapped, built from m (TagMappings is not available yet)
	index := map[string]string{}
	for _, mappings := range []tagMappings{m.Main, m.Additional} {
		for name, c := range mappings {
			index[strings.ToLower(string(name))] = strings.ToLower(string(name))
			for _, a := range c.Aliases {
				index[strings.ToLower(a)] = strings.ToLower(string(name))
			}
		}
	}
	valid, err := validateCisumTags(saved, func(alias string) (string, bool) {
		owner, ok := index[alias]
		return owner, ok
	})
	if err != nil {
		log.Error("Invalid Cisum free tags, they are ignored", "file", cisumTagsPath(), err)
		return
	}
	for _, t := range valid.Tags {
		if add(t) {
			activeCustomTags = append(activeCustomTags, t)
		}
	}
	if len(activeCustomTags) > 0 {
		log.Info("Cisum free tags loaded", "count", len(activeCustomTags))
	}
}
