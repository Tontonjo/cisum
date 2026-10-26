# Cisum

## Tonton Jo  
### Join the community:
[![Youtube](https://badgen.net/badge/Youtube/Subscribe)](http://youtube.com/channel/UCnED3K6K5FDUp-x_8rwpsZw?sub_confirmation=1)
[![Discord Tonton Jo](https://badgen.net/discord/members/h6UcpwfGuJ?label=Discord%20Tonton%20Jo%20&icon=discord)](https://discord.gg/h6UcpwfGuJ)
### Support my work, give a thanks and help the youtube channel:
[![Ko-Fi](https://badgen.net/badge/Buy%20me%20a%20Coffee/Link?icon=buymeacoffee)](https://ko-fi.com/tontonjo)
[![Infomaniak](https://badgen.net/badge/Infomaniak/Affiliated%20link?icon=K)](https://www.infomaniak.com/goto/fr/home?utm_term=6151f412daf35)

Version: 0.11.5

## Description
Cisum is a self-hosted music server running in Docker, with a modern web player.  
It is based on [Navidrome](https://github.com/navidrome/navidrome) and keeps the full Subsonic API: your usual Subsonic apps (Symfonium, DSub, Substreamer, Tempo...) keep working.

> **Warning:** this project is AI coded and has not been reviewed. Use it at your own risk and keep backups of your data.

## Functions
- Modern web player (desktop and mobile), colors follow the album cover
- Waveform progress bar
- Synced lyrics (local files, embedded tags, then LRCLIB online)
- Artist pictures, biography and similar artists
- Playlists: songs whose file disappears are kept and come back automatically
- Dynamic playlists: built from rules (and / or), sort, limit, rebuilt each time they are opened
- Playlist import / export (M3U, M3U8, ZIP, .nsp)
- Playlist sharing between users (listeners and editors)
- Web radios, with the radio-browser.info directory
- Public share links (optional)
- Built-in administration: users, rights, libraries, scans, backups, maintenance
- Import playlists, favorites, ratings and play counts from another Subsonic server
- Automatic scan when music files change

## Start the container
Image: [tontonjo/cisum](https://hub.docker.com/r/tontonjo/cisum)

1. Create the data folder on your Docker host:
```shell
mkdir -p /srv/cisum/data
```
2. Start Cisum (adapt the values, see below):
```shell
docker run -d \
  --name cisum \
  --restart unless-stopped \
  -p 6874:6874 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Europe/Zurich \
  -v /srv/cisum/data:/data \
  -v /srv/music:/music:ro \
  tontonjo/cisum:latest
```
3. Open `http://<server-ip>:6874` and create the administrator account.  
Subsonic apps connect to the same address.

| Argument | Description |
|---|---|
| `-p 6874:6874` | Web port: `<host port>:6874`. Change only the first number to use another port |
| `-e PUID=1000` / `-e PGID=1000` | User and group Cisum runs as (run `id` on the host to see yours). They must be able to read the music folder. The data folder is given to them automatically |
| `-e TZ=Europe/Zurich` | Time zone |
| `-v /srv/cisum/data:/data` | Database, cache, backups and `cisum.toml` configuration. Keep it! |
| `-v /srv/music:/music:ro` | Your music folder, read-only is enough |

## Update
```shell
docker pull tontonjo/cisum:latest
docker stop cisum && docker rm cisum
```
Then run the `docker run` command again: your data stays in the data folder.

## Build from source
```shell
git clone https://github.com/Tontonjo/cisum.git
cd cisum
nano docker-compose.yml     # music folder, PUID / PGID
docker compose up -d --build
```

## Thanks to Navidrome
Cisum would not exist without [Navidrome](https://github.com/navidrome/navidrome) and its contributors. A big thank you to them!  
Cisum is a fork of Navidrome and reuses most of it:
- Music scanner, tag reading and library database
- Subsonic / OpenSubsonic API, used by the mobile apps
- Streaming, transcoding, users and authentication
- Smart playlists engine (used by dynamic playlists)

Cisum adds a new web player, the administration, the playlist, radio and lyrics features listed above.  
The Go module keeps its original name (`github.com/navidrome/navidrome`): only the name is kept, the code built is the one in this repository.  
If you want the original, maintained and reviewed project, use Navidrome: https://www.navidrome.org

## More
Options, troubleshooting and technical details: [CISUM.md](CISUM.md)

Licensed under GPL-3.0, like Navidrome.
