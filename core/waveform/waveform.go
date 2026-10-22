// Package waveform builds compact waveform peaks used by the Cisum web player progress bar.
// Cisum v0.1.0
//
// Audio is decoded once with ffmpeg to low-rate mono PCM, reduced to a fixed number of peaks
// (0-255) and cached on disk. Concurrent requests for the same track share a single decode.
package waveform

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/ffmpeg"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"golang.org/x/sync/singleflight"
)

const (
	sampleRate   = 4000 // Hz, enough to capture loudness envelope
	frameSamples = 40   // 10 ms frames, intermediate resolution before resampling to bins
	minBins      = 50
	maxBins      = 4000
)

var ErrDisabled = errors.New("waveform generation is disabled")

var (
	group singleflight.Group
	sem   chan struct{}
	once  sync.Once
)

// Get returns `bins` peaks (0-255) for the media file, from cache when available.
func Get(ctx context.Context, mf *model.MediaFile, bins int) ([]byte, error) {
	if !conf.Server.Waveform.Enabled {
		return nil, ErrDisabled
	}
	if bins <= 0 {
		bins = conf.Server.Waveform.Bins
	}
	bins = min(max(bins, minBins), maxBins)
	path := cachePath(mf, bins)
	if data, err := os.ReadFile(path); err == nil && len(data) == bins {
		return data, nil
	}
	v, err, _ := group.Do(path, func() (any, error) {
		acquire()
		defer release()
		// Detached context: a client disconnect must not waste a decode shared with others.
		peaks, err := compute(context.WithoutCancel(ctx), mf.AbsolutePath(), bins)
		if err != nil {
			return nil, err
		}
		store(path, peaks)
		return peaks, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

func acquire() {
	once.Do(func() { sem = make(chan struct{}, max(conf.Server.Waveform.Concurrency, 1)) })
	sem <- struct{}{}
}

func release() { <-sem }

func cachePath(mf *model.MediaFile, bins int) string {
	// File size in the key invalidates the cache when the audio file is replaced.
	name := mf.ID + "_" + strconv.FormatInt(mf.Size, 10) + "_" + strconv.Itoa(bins) + ".bin"
	prefix := "00"
	if len(mf.ID) >= 2 {
		prefix = mf.ID[:2]
	}
	return filepath.Join(conf.Server.CacheFolder.String(), "waveforms", prefix, name)
}

func store(path string, peaks []byte) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Warn("Could not create waveform cache folder", "path", path, err)
		return
	}
	_ = os.WriteFile(path, peaks, 0o600)
}

// compute decodes the file and returns normalized peaks.
func compute(ctx context.Context, file string, bins int) ([]byte, error) {
	cmdPath, err := ffmpeg.New().CmdPath()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg not available: %w", err)
	}
	cmd := exec.CommandContext(ctx, cmdPath, "-v", "error", "-nostdin", "-i", file, //nolint:gosec
		"-vn", "-ac", "1", "-ar", strconv.Itoa(sampleRate), "-f", "s16le", "-acodec", "pcm_s16le", "-")
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	frames, readErr := readFrames(out)
	waitErr := cmd.Wait()
	if readErr != nil {
		return nil, readErr
	}
	if waitErr != nil && len(frames) == 0 {
		return nil, fmt.Errorf("decoding %s: %w", file, waitErr)
	}
	return resample(frames, bins), nil
}

// readFrames reads PCM s16le samples and returns the RMS level of each 10 ms frame.
func readFrames(r io.Reader) ([]float64, error) {
	br := bufio.NewReaderSize(r, 64*1024)
	var frames []float64
	var sum float64
	n := 0
	buf := make([]byte, 2)
	for {
		if _, err := io.ReadFull(br, buf); err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
				break
			}
			return nil, err
		}
		s := float64(int16(binary.LittleEndian.Uint16(buf))) / 32768
		sum += s * s
		n++
		if n == frameSamples {
			frames = append(frames, math.Sqrt(sum/float64(n)))
			sum, n = 0, 0
		}
	}
	if n > 0 {
		frames = append(frames, math.Sqrt(sum/float64(n)))
	}
	return frames, nil
}

// resample reduces frames to `bins` values using the max of each bucket, normalized to 0-255.
func resample(frames []float64, bins int) []byte {
	peaks := make([]float64, bins)
	if len(frames) == 0 {
		return make([]byte, bins)
	}
	top := 0.0
	for i := range bins {
		start := i * len(frames) / bins
		end := max((i+1)*len(frames)/bins, start+1)
		end = min(end, len(frames))
		for _, f := range frames[start:end] {
			peaks[i] = max(peaks[i], f)
		}
		top = max(top, peaks[i])
	}
	res := make([]byte, bins)
	if top == 0 {
		return res
	}
	for i, p := range peaks {
		res[i] = byte(math.Round(p / top * 255))
	}
	return res
}
