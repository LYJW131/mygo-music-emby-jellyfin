// The built plugin against a real Emby or Jellyfin server (not in CI):
//
//   EMBY_SERVER=http://192.168.1.2:8096 EMBY_KEY=… npm run test:live
//
// or EMBY_USER and EMBY_PASSWORD instead of EMBY_KEY. It reads the library,
// fetches a song and its lyrics, and makes a playlist it deletes after.
// Liking a song is undone; nothing is marked played.

import assert from "node:assert/strict";
import { load } from "./harness.ts";

const server = process.env.EMBY_SERVER;
if (!server) throw new Error("Set EMBY_SERVER, and EMBY_KEY or EMBY_USER and EMBY_PASSWORD");
const { api } = await load({
  settings: {
    server,
    apiKey: process.env.EMBY_KEY ?? "",
    username: process.env.EMBY_USER ?? "",
    password: process.env.EMBY_PASSWORD ?? "",
  },
});

const step = async (name: string, fn: () => Promise<any>): Promise<any> => {
  const started = Date.now();
  const value = await fn();
  console.log(`ok ${name} (${Date.now() - started} ms)`);
  return value;
};

const account = await step("account", () => api.account());
console.log(`   as ${account.name}`);
const home = await step("home", () => api.home());
for (const s of home.sections) {
  const n = ["tracks", "albums", "artists", "playlists"].map((k) => s[k]?.length).find(Boolean) ?? 0;
  console.log(`   ${s.title}: ${n}`);
}
const tracks = home.sections[0].tracks;
assert.ok(tracks.length > 0, "the library has songs");

const albums = await step("savedAlbums", () => api.savedAlbums({ offset: 0 }));
const album = await step("album", () => api.album({ id: albums.albums[0].id }));
console.log(`   ${album.album.name}: ${album.tracks.length} songs`);
const artist = await step("artist", () => api.artist({ id: album.tracks[0].artists[0].id }));
console.log(`   ${artist.artist.name}: ${artist.tracks.length} songs, ${artist.albums.length} albums`);
for (const page of ["recentlyAdded", "artists", "genres", "recentlyPlayed", "mostPlayed"]) {
  await step(`browse ${page}`, () => api.browse({ page }));
}
const genres = await api.browse({ page: "genres" });
if (genres.sections[0].links?.length)
  await step("browse genre", () => api.browse({ page: genres.sections[0].links[0].page }));

const found = await step("search", () => api.search({ query: tracks[0].name.slice(0, 4), kind: "tracks", offset: 0 }));
assert.ok(found.tracks.length > 0);
await step("search artists", () =>
  api.search({ query: tracks[0].artists[0].name.slice(0, 3), kind: "artists", offset: 0 }),
);
await step("suggest", () => api.suggest({ query: tracks[0].name.slice(0, 2) }));

for (const quality of ["lossless", "high", "standard"]) {
  const s = await step(`stream ${quality}`, () => api.stream({ id: tracks[0].id, quality }));
  const res = await fetch(s.url, { headers: { ...s.headers, range: "bytes=0-65535" } });
  assert.ok(res.ok, `${quality}: ${res.status}`);
  const bytes = (await res.arrayBuffer()).byteLength;
  await res.body?.cancel().catch(() => {});
  console.log(`   ${s.type} ${s.quality} ${s.bitRate ?? ""} → ${res.status}, ${bytes} bytes`);
}

let lyrics = null;
for (const t of tracks) {
  lyrics = await api.lyrics({ id: t.id });
  if (lyrics) {
    console.log(`ok lyrics for ${t.name}: ${lyrics.lines?.length ?? "lrc"} lines`);
    break;
  }
}
if (!lyrics) console.log("-- none of today's songs have timed lyrics");

const stations = await step("stations", () => api.stations());
console.log(`   ${stations.map((s: { name: string }) => s.name).join(", ")}`);
await step("stationNext", () => api.stationNext({ id: stations[0].id }));
await step("liked", () => api.liked({ offset: 0 }));
await step("recent", () => api.recent());

const song = tracks[0];
const was = (await api.isLiked({ ids: [song.id] }))[song.id];
await step("like and undo", async () => {
  await api.like({ id: song.id, on: !was });
  assert.equal((await api.isLiked({ ids: [song.id] }))[song.id], !was);
  await api.like({ id: song.id, on: was });
});

const list = await step("createPlaylist", () => api.createPlaylist({ name: "MyGo Music test" }));
try {
  await step("addToPlaylist", () =>
    api.addToPlaylist({ id: list.id, trackIds: tracks.slice(0, 3).map((t: { id: string }) => t.id) }),
  );
  await step("movePlaylistTrack", () => api.movePlaylistTrack({ id: list.id, from: 2, to: 0 }));
  await step("removeFromPlaylist", () => api.removeFromPlaylist({ id: list.id, trackIds: [tracks[0].id] }));
  const got = await step("playlist", () => api.playlist({ id: list.id }));
  assert.deepEqual(
    got.tracks.map((t: { id: string }) => t.id),
    [tracks[2].id, tracks[1].id],
  );
  await step("renamePlaylist", () => api.renamePlaylist({ id: list.id, name: "MyGo Music test 2" }));
  assert.equal((await api.playlist({ id: list.id })).name, "MyGo Music test 2");
  assert.ok((await api.playlists()).some((p: { id: string }) => p.id === list.id));
} finally {
  await step("deletePlaylist", () => api.deletePlaylist({ id: list.id }));
}
console.log("all good");
