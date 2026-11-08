# Emby / Jellyfin for MyGo Music

A [MyGo Music](https://github.com/egoist/mygo-music) plugin: the music on the listener's own Emby or Jellyfin server,
through the REST API they share (Jellyfin forked Emby). The plugin spec is MyGo Music's README ("Plugins") and
`internal/plugin/*.go`.

## Commands

```bash
npm run build        # src/ → dist/plugin (index.js bundle + plugin.json, locales, READMEs, LICENSE)
npm test             # build, then node --test tests/*.test.ts, against tests/fake-emby.ts (offline)
npm run check        # typecheck + prettier --check + test + package; what CI runs
npm run format       # prettier --write
EMBY_SERVER=… EMBY_KEY=… npm run test:live   # a real server (not in CI); or EMBY_USER/EMBY_PASSWORD
```

Node 22.18+ runs the `.ts` scripts and tests directly (type stripping).

## Layout

- `src/index.ts` exports exactly the functions MyGo calls; `tests/plugin.test.ts` pins that list.
- `emby.ts`: the server address (a bare host gets `http://` and `:8096`), the session (API key → `/Users` and the user
  named, the only one or the first administrator; else `AuthenticateByName` with the user name and password), kept in
  storage keyed by a hash of the settings, and `api()`, where `{user}` in a path or parameter is the user's ID. A
  password's token that 401s signs in again once.
- `models.ts` Emby items → MyGo shapes; pictures are `/Items/{id}/Images/Primary` with `{size}`.
- `library.ts` favorites, albums, plays, playlists (entries by `PlaylistItemId`); `pages.ts` home, album, artist and
  the `browse` pages; `search.ts`; `stations.ts` (random shuffles by filter); `lyrics.ts` (subtitle streams as
  `Stream.js`, timed only); `stream.ts` (the file with `static=true`, or `stream.mp3`/`stream.flac` transcodes).
- Emby answers `TotalRecordCount` 0 for a search, so paging is by a full page coming back.

## Emby and Jellyfin

One code path for both; where they differ the plugin tries the common way and falls back:

- Auth is only `Authorization: MediaBrowser …, Token="…"`, which both take. Jellyfin 12 rejects `X-Emby-Token` and
  `X-Emby-Authorization` by default, and has no `/emby/` prefix: paths start at the server's root.
- Lyrics: Emby has `Subtitle` streams (`Subtitles/{index}/Stream.js`); Jellyfin a `Lyric` stream and `HasLyrics`, read
  from `/Audio/{id}/Lyrics` (lines with `Start`, words from `Cues`).
- Playlists: Jellyfin moves an entry only for a signed-in user (an API key gets 400), so `movePlaylistTrack` removes
  the entries from the change on and adds them back in order. Renaming is `POST /Items/{id}` (administrators), else
  Jellyfin's `POST /Playlists/{id}` (the owner). Jellyfin's `PlaylistItemId` is the song's ID.
- To try Jellyfin, run `jellyfin/jellyfin` in Docker with a music folder, finish the wizard through `/Startup/*`, add
  the library (`/Library/VirtualFolders`), make a key (`/Auth/Keys`) and run `test:live` against it.

## Runtime constraints

The bundle runs in MyGo's moejs runtime, not Node: one ES module that imports nothing at runtime (`scripts/build.ts`
fails otherwise), no Node APIs. Never touch `host` at module load. Erasable TypeScript only; relative imports end in
`.ts`. Errors the app should act on carry a code: `fail("signIn" | "setup" | "unavailable" | "unsupported", message)`.

`host.storage` keys: `deviceId`, `session`, `token` (for plugin.json's `requestHeaders`), `signedOut`, `daily`.

## Conventions

- User-facing text goes through `t("English text")` and needs an entry in `locales/zh-CN.json`; a test checks every
  `t("…")`, navigation title and setting. Chinese follows Emby's own Simplified Chinese wording.
- Comments say why, in plain sentences.
- Never commit an API key, token or password. The live test reads them from the environment.
- `plugin.json` holds the version; `package.json` has none.
- Commits follow Conventional Commits, in English, lower case, no full stop, signed off, ending with the
  `Co-Authored-By` trailer.

## Releasing

MyGo installs the latest release's zip (`mygo-music-emby-jellyfin-v<version>.zip`), else the default branch, which has
no built `index.js`: a release is required.

1. Raise `version` in `plugin.json`, push to `main`, wait for CI.
2. Tag that commit `v<version>` and push the tag. The **Release** workflow checks the tag, runs `npm run check` and
   publishes the zip. Ask the maintainer before pushing a tag.

To try a build in the local app, copy `dist/plugin/*` into `~/.config/MyGo Music/plugins/emby/` (a real directory)
and restart MyGo.
