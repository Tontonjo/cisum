// Cisum v0.7.0 - Station directory: search in radio-browser.info (community database, free API).
package radio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/navidrome/navidrome/consts"
)

// Station is a directory entry, ready to be added to the library.
type Station struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	Homepage    string   `json:"homepage,omitempty"`
	Favicon     string   `json:"favicon,omitempty"`
	Country     string   `json:"country,omitempty"`
	CountryCode string   `json:"countryCode,omitempty"`
	Codec       string   `json:"codec,omitempty"`
	Bitrate     int      `json:"bitrate,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	HLS         bool     `json:"hls,omitempty"`
}

// Country is a directory country with its number of stations.
type Country struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	Stations int    `json:"stations"`
}

// Query filters a directory search. Empty fields are ignored; no filter at all lists popular stations.
type Query struct {
	Name    string
	Tag     string
	Country string // ISO 3166-1 alpha-2
	Limit   int
}

var apiClient = &http.Client{Timeout: 15 * time.Second}

// DefaultBaseURL balances between the directory servers; known mirrors are tried when it fails.
const DefaultBaseURL = "https://all.api.radio-browser.info"

var mirrors = []string{"https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"}

func call(ctx context.Context, baseURL, path string, params url.Values, out any) error {
	bases := []string{baseURL}
	if strings.TrimRight(baseURL, "/") == DefaultBaseURL {
		bases = append(bases, mirrors...)
	}
	var err error
	for _, base := range bases {
		if err = callOne(ctx, base, path, params, out); err == nil || ctx.Err() != nil {
			return err
		}
	}
	return err
}

func callOne(ctx context.Context, baseURL, path string, params url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+path+"?"+params.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", consts.HTTPUserAgent)
	resp, err := apiClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("radio directory answered %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Search queries the directory, most listened stations first. Broken stations are hidden.
func Search(ctx context.Context, baseURL string, q Query) ([]Station, error) {
	limit := q.Limit
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	params := url.Values{
		"limit": {strconv.Itoa(limit)}, "hidebroken": {"true"}, "order": {"clickcount"}, "reverse": {"true"},
	}
	if q.Name != "" {
		params.Set("name", q.Name)
	}
	if q.Tag != "" {
		params.Set("tag", q.Tag)
	}
	if q.Country != "" {
		params.Set("countrycode", strings.ToUpper(q.Country))
	}
	var raw []struct {
		StationUUID string `json:"stationuuid"`
		Name        string `json:"name"`
		URL         string `json:"url"`
		URLResolved string `json:"url_resolved"`
		Homepage    string `json:"homepage"`
		Favicon     string `json:"favicon"`
		Tags        string `json:"tags"`
		Country     string `json:"country"`
		CountryCode string `json:"countrycode"`
		Codec       string `json:"codec"`
		Bitrate     int    `json:"bitrate"`
		HLS         int    `json:"hls"`
	}
	if err := call(ctx, baseURL, "/json/stations/search", params, &raw); err != nil {
		return nil, err
	}
	res := make([]Station, 0, len(raw))
	for _, s := range raw {
		u := s.URLResolved
		if u == "" {
			u = s.URL
		}
		var tags []string
		for _, t := range strings.Split(s.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" && len(tags) < 6 {
				tags = append(tags, t)
			}
		}
		res = append(res, Station{
			ID: s.StationUUID, Name: strings.TrimSpace(s.Name), URL: u, Homepage: s.Homepage, Favicon: s.Favicon,
			Country: s.Country, CountryCode: s.CountryCode, Codec: s.Codec, Bitrate: s.Bitrate, Tags: tags, HLS: s.HLS == 1,
		})
	}
	return res, nil
}

var countries struct {
	sync.Mutex
	list    []Country
	fetched time.Time
}

// Countries lists the directory countries, most stations first (cached one day).
func Countries(ctx context.Context, baseURL string) ([]Country, error) {
	countries.Lock()
	defer countries.Unlock()
	if countries.list != nil && time.Since(countries.fetched) < 24*time.Hour {
		return countries.list, nil
	}
	var raw []struct {
		Name         string `json:"name"`
		Code         string `json:"iso_3166_1"`
		StationCount int    `json:"stationcount"`
	}
	params := url.Values{"order": {"stationcount"}, "reverse": {"true"}, "hidebroken": {"true"}}
	if err := call(ctx, baseURL, "/json/countries", params, &raw); err != nil {
		return nil, err
	}
	list := make([]Country, 0, len(raw))
	for _, c := range raw {
		if c.Code != "" && c.StationCount > 0 {
			list = append(list, Country{Code: c.Code, Name: c.Name, Stations: c.StationCount})
		}
	}
	countries.list, countries.fetched = list, time.Now()
	return list, nil
}
