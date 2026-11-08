# Emby / Jellyfin for MyGo Music

Listen to the music on your own [Emby](https://emby.media) or [Jellyfin](https://jellyfin.org) server in
[MyGo Music](https://github.com/egoist/mygo-music): ALAC and FLAC play as they are, favorites, playlists and play
counts stay in step with the server, and .lrc lyrics follow the song.

Jellyfin began as a fork of Emby and their APIs are much the same, so one plugin does both. Tried on Emby 4.10 and
Jellyfin 12.4.

[中文](README.md)

## Install

Paste `https://github.com/LYJW131/mygo-music-emby-jellyfin` in MyGo Music's Settings > Plugins > `+`, or
[install it here](mygo-music://install-plugin?repo=LYJW131/mygo-music-emby-jellyfin).

<a id="setting-up"></a>

## Setting up

In Settings > Plugins > Emby / Jellyfin, fill in:

| Setting                | What                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Server Address         | Such as `http://192.168.1.2:8096`; with just an IP or host name, port 8096 is assumed                   |
| API Key                | Either: a key made in the dashboard, under Advanced > API Keys in Emby or API Keys in Jellyfin          |
| User Name and Password | Or: your account. With an API key, a user name alone says whose library to use (else the administrator) |

Then choose **Emby / Jellyfin** as the source and sign in.

## Features

- Home: Today's Mix (picked from the library at random, once a day), Recently Played, Recently Added, Most Played,
  Playlists, Albums to Explore and Artists.
- Album, artist and genre pages, every album a page at a time, search for songs, albums, artists and playlists, and
  suggestions as you type.
- Favorite songs (the server's favorites); songs played count toward its play counts and Recently Played.
- Playlists: create, rename, delete, add, remove and reorder, on the server itself.
- Shuffle stations: everything, favorites, never played, and rediscover.
- Lyrics: timed lyrics the server reads from an .lrc file or the tags; two lines at the same time are a line and its
  translation, and Jellyfin's word timings show word by word. Lyrics without times aren't shown.
- Quality: Lossless plays the file itself (ALAC, FLAC, MP3, AAC, Vorbis, WAV), and what the app can't play (Opus,
  APE, WMA…) the server transcodes to FLAC or MP3. High and Standard have the server transcode to 320 or 128 kbps MP3, except
  lossy files small enough already.

## Privacy

- The API key, user name and password are kept in the plugin's settings, and the access token a password signs in
  with in its data, **unencrypted**, and only sent to the server you set.
- The plugin shows in the server's Devices as MyGo Music.

## Jellyfin's differences

- With an API key, Jellyfin won't move a playlist's songs for a request that isn't a signed-in user's, so the plugin
  takes out the songs from where the order changes and adds them back in their new order, which comes to the same.
- A user who isn't an administrator can rename their own playlists.

## License

[AGPL-3.0](LICENSE). Not affiliated with Emby or Jellyfin.
