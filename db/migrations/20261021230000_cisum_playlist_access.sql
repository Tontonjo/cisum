-- Cisum v0.5.0: per-user access to playlists.
-- A row gives a user access to a playlist: can_edit = 0 to listen, 1 to also add/remove/reorder songs.
-- The owner and administrators always have full access; playlist.public = 1 still means "visible to all".
-- +goose Up
-- +goose StatementBegin
create table if not exists playlist_access
(
    playlist_id varchar not null references playlist (id) on delete cascade,
    user_id     varchar not null references user (id) on delete cascade,
    can_edit    bool    not null default false,
    primary key (playlist_id, user_id)
);
create index if not exists playlist_access_user_id on playlist_access (user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
drop table if exists playlist_access;
-- +goose StatementEnd
