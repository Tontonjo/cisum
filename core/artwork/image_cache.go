package artwork

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"strings"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/core/ffmpeg"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/utils/cache"
	"github.com/navidrome/navidrome/utils/singleton"
)

// artworkReader is the cache.Item the image cache loader dispatches on: Reader
// produces the (possibly resized) bytes to store under Key.
type artworkReader interface {
	cache.Item
	Reader(ctx context.Context) (io.ReadCloser, error)
}

type imageCache struct {
	cache.FileCache
}

func GetImageCache() cache.FileCache {
	return singleton.GetInstance(func() *imageCache {
		return &imageCache{
			FileCache: cache.NewFileCache("Image", conf.Server.ImageCacheSize, consts.ImageCacheDir, consts.DefaultImageCacheMaxItems,
				func(ctx context.Context, arg cache.Item) (io.Reader, error) {
					return arg.(artworkReader).Reader(ctx)
				}),
		}
	})
}

// Cisum: image cache size managed from the admin page. The value is stored in the property table
// with the same format as ImageCacheSize ("500MB", or cache.UnlimitedCacheSize). Priority:
// CISUM_IMAGECACHESIZE environment variable, then the admin page value, then the config file / default.

// ErrImageCacheSizeFromEnv is returned when the size is fixed by the CISUM_IMAGECACHESIZE variable.
var ErrImageCacheSizeFromEnv = errors.New("the image cache size is set by the " + consts.ImageCacheSizeEnvVar +
	" environment variable: remove it and restart to manage the size from the admin page")

// ImageCacheSizeEnv returns the CISUM_IMAGECACHESIZE environment variable, "" when it is not set.
func ImageCacheSizeEnv() string {
	return strings.TrimSpace(os.Getenv(consts.ImageCacheSizeEnvVar))
}

// ApplyStoredImageCacheSize copies the size saved from the admin page into the configuration,
// unless CISUM_IMAGECACHESIZE is set. It must run before the first GetImageCache call (startup),
// which reads conf.Server.ImageCacheSize.
func ApplyStoredImageCacheSize(ctx context.Context, ds model.DataStore) {
	configImageCacheSize = conf.Server.ImageCacheSize
	stored, err := ds.Property().DefaultGet(ctx, consts.ImageCacheSizePropertyKey, "")
	if err != nil || stored == "" {
		return
	}
	if env := ImageCacheSizeEnv(); env != "" {
		log.Info(ctx, "Image cache size set by the environment, admin page value ignored",
			"variable", consts.ImageCacheSizeEnvVar, "size", env, "adminValue", stored)
		return
	}
	if _, _, err := cache.ParseCacheSize(stored); err != nil {
		log.Warn(ctx, "Ignoring invalid image cache size saved from the admin page", "value", stored, err)
		return
	}
	log.Info(ctx, "Using image cache size set from the admin page", "size", stored, "configValue", conf.Server.ImageCacheSize)
	conf.Server.ImageCacheSize = stored
}

// configImageCacheSize is ImageCacheSize as configured (file or environment), before the admin value.
var configImageCacheSize string

// ConfigImageCacheSize returns the configured ImageCacheSize, ignoring the admin page value.
func ConfigImageCacheSize() string {
	if configImageCacheSize == "" {
		return conf.Server.ImageCacheSize
	}
	return configImageCacheSize
}

// StoredImageCacheSize returns the size saved from the admin page, or "" when none was saved.
func StoredImageCacheSize(ctx context.Context, ds model.DataStore) string {
	stored, _ := ds.Property().DefaultGet(ctx, consts.ImageCacheSizePropertyKey, "")
	return stored
}

// SetImageCacheSize saves a new image cache size and applies it to the running cache.
// restartRequired is true when the running cache cannot take it (cache disabled at startup).
func SetImageCacheSize(ctx context.Context, ds model.DataStore, size string) (restartRequired bool, err error) {
	if ImageCacheSizeEnv() != "" {
		return false, ErrImageCacheSizeFromEnv
	}
	if _, _, err := cache.ParseCacheSize(size); err != nil {
		return false, err
	}
	adjustable, ok := GetImageCache().(*imageCache).FileCache.(cache.SizeAdjustable)
	if !ok {
		return false, errors.New("the image cache size cannot be changed while running")
	}
	applied, err := adjustable.SetMaxSize(size)
	if err != nil {
		return false, err
	}
	if err := ds.Property().Put(ctx, consts.ImageCacheSizePropertyKey, size); err != nil {
		return false, err
	}
	return !applied, nil
}

// resizedItem is an artworkReader that resizes bytes opened by open() and caches the
// result under a hash-derived key.
type resizedItem struct {
	hash   string
	size   int
	square bool
	ffmpeg ffmpeg.FFmpeg
	open   func() (io.ReadCloser, error)
}

// Key is the ETag namespaced for the cache, so the validator a client holds and the entry it
// validates can never drift apart.
func (r *resizedItem) Key() string {
	return "h-" + representationTag(r.hash, r.size, r.square)
}

func (r *resizedItem) Reader(ctx context.Context) (io.ReadCloser, error) {
	orig, err := r.open()
	if err != nil {
		return nil, err
	}
	// An open() that reports "no image" as a nil reader would otherwise panic on the Close below.
	if orig == nil {
		return nil, ErrUnavailable
	}
	defer orig.Close()
	data, err := readCapped(orig)
	if err != nil {
		return nil, err
	}
	resized, _, err := resizeImageData(ctx, r.ffmpeg, data, r.size, r.square)
	if err != nil || resized == nil {
		// Resize failed or image already within bounds: serve the original bytes.
		return io.NopCloser(bytes.NewReader(data)), nil
	}
	if rc, ok := resized.(io.ReadCloser); ok {
		return rc, nil
	}
	return io.NopCloser(resized), nil
}
