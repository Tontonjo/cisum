package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/mattn/go-sqlite3"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/log"
)

const (
	backupPrefix      = "cisum_backup"
	backupRegexString = "^" + backupPrefix + "_(.+)\\.db$"
)

var backupRegex = regexp.MustCompile(backupRegexString)

const backupSuffixLayout = "2006.01.02_15.04.05"

func backupPath(t time.Time) string {
	return filepath.Join(
		conf.Server.Backup.Path.MustPath(),
		fmt.Sprintf("%s_%s.db", backupPrefix, t.Format(backupSuffixLayout)),
	)
}

// backupOrRestore copies the database. When progress is not nil (Cisum), the copy runs in chunks and
// reports its completion (0-100); otherwise it runs in one step as upstream does.
func backupOrRestore(ctx context.Context, isBackup bool, path string, progress func(percent float64)) error {
	// heavily inspired by https://codingrabbits.dev/posts/go_and_sqlite_backup_and_maybe_restore/
	existingConn, err := Db().Conn(ctx)
	if err != nil {
		return fmt.Errorf("getting existing connection: %w", err)
	}
	defer existingConn.Close()

	// The driver opens with SQLITE_OPEN_CREATE, so without this check a typo in the
	// path would create an empty database and "restore" it over the live one.
	if !isBackup {
		// The driver splits the DSN at '?', so such a path would open a different file.
		if strings.ContainsRune(path, '?') {
			return fmt.Errorf("backup path cannot contain '?': %s", path)
		}
		if _, err := os.Stat(path); err != nil {
			return fmt.Errorf("backup file not available: %w", err)
		}
	}

	backupDb, err := sql.Open(Driver, path)
	if err != nil {
		return fmt.Errorf("opening backup database in '%s': %w", path, err)
	}
	defer backupDb.Close()

	backupConn, err := backupDb.Conn(ctx)
	if err != nil {
		return fmt.Errorf("getting backup connection: %w", err)
	}
	defer backupConn.Close()

	err = existingConn.Raw(func(existing any) error {
		return backupConn.Raw(func(backup any) error {
			var sourceOk, destOk bool
			var sourceConn, destConn *sqlite3.SQLiteConn

			if isBackup {
				sourceConn, sourceOk = existing.(*sqlite3.SQLiteConn)
				destConn, destOk = backup.(*sqlite3.SQLiteConn)
			} else {
				sourceConn, sourceOk = backup.(*sqlite3.SQLiteConn)
				destConn, destOk = existing.(*sqlite3.SQLiteConn)
			}

			if !sourceOk {
				return fmt.Errorf("error trying to convert source to sqlite connection")
			}
			if !destOk {
				return fmt.Errorf("error trying to convert destination to sqlite connection")
			}

			backupOp, err := destConn.Backup("main", sourceConn, "main")
			if err != nil {
				return fmt.Errorf("error starting sqlite backup: %w", err)
			}
			defer backupOp.Close()

			var done bool
			if progress == nil {
				// Caution: -1 means that sqlite will hold a read lock until the operation finishes
				// This will lock out other writes that could happen at the same time
				done, err = backupOp.Step(-1)
				if err != nil {
					return fmt.Errorf("error during backup step: %w", err)
				}
			} else {
				const pagesPerStep = 512
				for !done {
					done, err = backupOp.Step(pagesPerStep)
					if err != nil {
						return fmt.Errorf("error during backup step: %w", err)
					}
					if total := backupOp.PageCount(); total > 0 {
						progress(100 * float64(total-backupOp.Remaining()) / float64(total))
					}
				}
			}
			if !done {
				return fmt.Errorf("backup not done with step -1")
			}

			err = backupOp.Finish()
			if err != nil {
				return fmt.Errorf("error finishing backup: %w", err)
			}

			return nil
		})
	})

	return err
}

func Backup(ctx context.Context) (string, error) {
	return BackupWithProgress(ctx, nil)
}

// BackupWithProgress creates a backup and reports its completion (Cisum v0.5.0).
func BackupWithProgress(ctx context.Context, progress func(percent float64)) (string, error) {
	destPath := backupPath(time.Now())
	log.Debug(ctx, "Creating backup", "path", destPath)
	err := backupOrRestore(ctx, true, destPath, progress)
	if err != nil {
		return "", err
	}

	return destPath, nil
}

func Restore(ctx context.Context, path string) error {
	log.Debug(ctx, "Restoring backup", "path", path)
	return backupOrRestore(ctx, false, path, nil)
}

func Prune(ctx context.Context) (int, error) {
	backupDir, err := conf.Server.Backup.Path.Path()
	if err != nil {
		return 0, fmt.Errorf("backup directory not available: %w", err)
	}
	files, err := os.ReadDir(backupDir)
	if err != nil {
		return 0, fmt.Errorf("unable to read database backup entries: %w", err)
	}

	var backupTimes []time.Time

	for _, file := range files {
		if !file.IsDir() {
			submatch := backupRegex.FindStringSubmatch(file.Name())
			if len(submatch) == 2 {
				timestamp, err := time.Parse(backupSuffixLayout, submatch[1])
				if err == nil {
					backupTimes = append(backupTimes, timestamp)
				}
			}
		}
	}

	if len(backupTimes) <= conf.Server.Backup.Count {
		return 0, nil
	}

	slices.SortFunc(backupTimes, func(a, b time.Time) int {
		return b.Compare(a)
	})

	pruneCount := 0
	var errs []error

	for _, timeToPrune := range backupTimes[conf.Server.Backup.Count:] {
		log.Debug(ctx, "Pruning backup", "time", timeToPrune)
		path := backupPath(timeToPrune)
		err = os.Remove(path)
		if err != nil {
			errs = append(errs, err)
		} else {
			pruneCount++
		}
	}

	if len(errs) > 0 {
		err = errors.Join(errs...)
		log.Error(ctx, "Failed to delete one or more files", "errors", err)
	}

	return pruneCount, err
}
