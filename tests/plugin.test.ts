// The built plugin, loaded as MyGo Music loads it, against a stand-in Emby
// server (fake-emby.ts).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { KEY, startFake, type Fake } from "./fake-emby.ts";
import { dist, load } from "./harness.ts";

let fake: Fake;
before(async () => (fake = await startFake()));
after(() => fake.close());

const withKey = (extra: Record<string, string> = {}) => load({ settings: { server: fake.url, apiKey: KEY, ...extra } });
const code = (c: string) => (e: { code?: string }) => e.code === c;

test("exports what the app calls, and nothing else", async () => {
  const { api } = await load();
  assert.deepEqual(Object.keys(api).sort(), [
    "account",
    "addToPlaylist",
    "album",
    "artist",
    "browse",
    "createPlaylist",
    "deletePlaylist",
    "home",
    "isLiked",
    "like",
    "liked",
    "lyrics",
    "movePlaylistTrack",
    "played",
    "playlist",
    "playlists",
    "recent",
    "removeFromPlaylist",
    "renamePlaylist",
    "savedAlbums",
    "search",
    "setSetting",
    "signIn",
    "signOut",
    "stationNext",
    "stations",
    "stream",
    "suggest",
  ]);
});

test("without settings, there's no account and the rest sends the listener to them", async () => {
  const { api } = await load();
  assert.equal(await api.account(), null);
  await assert.rejects(() => api.home(), code("setup"));
  await assert.rejects(() => api.signIn(), code("setup"));
  const { api: noAuth } = await load({ settings: { server: fake.url } });
  await assert.rejects(() => noAuth.liked({ offset: 0 }), code("setup"));
  const { api: badKey } = await load({ settings: { server: fake.url, apiKey: "nope" } });
  await assert.rejects(() => badKey.home(), /refused the API key/);
});

test("an API key acts as the administrator, or the user named", async () => {
  const { api, storage } = await withKey();
  const account = await api.account();
  assert.equal(account.name, "alice");
  assert.equal(
    account.imageUrl,
    `${fake.url}/Users/u-alice/Images/Primary?tag=pic&maxWidth={size}&maxHeight={size}&quality=90`,
  );
  assert.equal(storage.get("token"), KEY);
  const { api: asBob } = await withKey({ username: "bob" });
  assert.equal((await asBob.account()).id, "u-bob");
  const { api: nobody } = await withKey({ username: "carol" });
  assert.equal(await nobody.account(), null);
  await assert.rejects(() => nobody.home(), code("setup"));
});

test("a user name and password sign in once, and the token is kept", async () => {
  const settings = { server: fake.url, username: "Bob", password: "pw" };
  const { api, storage } = await load({ settings });
  assert.equal((await api.account()).name, "Bob");
  const signIns = () => fake.requests.filter((r) => r.path === "/Users/AuthenticateByName").length;
  const before = signIns();
  await api.liked({ offset: 0 });
  assert.equal(signIns(), before);
  assert.equal(storage.get("token"), "bobtoken");
  const last = fake.requests.at(-1)!;
  assert.match(
    last.headers.authorization as string,
    /^MediaBrowser .*Client="MyGo Music".*Version="\d+\.\d+\.\d+".*Token="bobtoken"$/,
  );
  // The settings change: it signs in again with them.
  settings.password = "wrong";
  api.setSetting({ key: "password", value: "wrong" });
  await assert.rejects(() => api.home(), /refused the user name or password/);
});

test("signing out forgets the server until signing in again", async () => {
  const { api } = await withKey();
  await api.signOut();
  assert.equal(await api.account(), null);
  await assert.rejects(() => api.playlists(), code("signIn"));
  assert.equal((await api.signIn()).name, "alice");
  assert.deepEqual(await api.playlists(), []);
});

test("albums, artists, home and pages", async () => {
  const { api } = await withKey();
  const album = await api.album({ id: "a1" });
  assert.equal(album.album.name, "Hekiten Banka");
  assert.equal(album.album.released, "2023");
  assert.deepEqual(
    album.tracks.map((t: { name: string }) => t.name),
    ["Haruhikage", "Mayoiuta", "Hekitenbanka", "Shiori"],
  );
  const track = album.tracks[0];
  assert.equal(track.duration, 200_000);
  assert.deepEqual(track.artists, [{ id: "ar1", name: "MyGO!!!!!" }]);
  assert.match(track.album.imageUrl, /\/Items\/a1\/Images\/Primary\?tag=cover&maxWidth=\{size\}/);

  const home = await api.home();
  assert.equal(home.sections[0].title, "Today's Mix");
  const mix = home.sections[0].tracks.map((t: { id: string }) => t.id);
  assert.deepEqual(
    (await api.home()).sections[0].tracks.map((t: { id: string }) => t.id),
    mix,
  );
  const artist = await api.artist({ id: "ar1" });
  assert.equal(artist.artist.name, "MyGO!!!!!");
  assert.equal(artist.tracks.length, 4);
  assert.deepEqual((await api.browse({ page: "genres" })).sections[0].links, [{ title: "Rock", page: "genre:g1" }]);
  assert.equal((await api.browse({ page: "artists" })).sections[0].artists.length, 1);
  await assert.rejects(() => api.browse({ page: "nope" }), code("unsupported"));
});

test("favorites and plays", async () => {
  const { api } = await withKey();
  assert.deepEqual(await api.isLiked({ ids: ["s1", "s2"] }), { s1: false, s2: true });
  await api.like({ id: "s1", on: true });
  await api.like({ id: "s2", on: false });
  assert.deepEqual(await api.isLiked({ ids: ["s1", "s2"] }), { s1: true, s2: false });
  const liked = await api.liked({ offset: 0 });
  assert.deepEqual(
    liked.tracks.map((t: { id: string }) => t.id),
    ["s1"],
  );
  assert.equal(liked.more, false);
  await api.played({ id: "s4" });
  assert.match(fake.played.get("s4")!, /^\d{14}$/);
  assert.deepEqual(
    (await api.recent()).map((t: { id: string }) => t.id),
    ["s4"],
  );
});

test("search pages by what came back, as Emby doesn't count", async () => {
  const { api } = await withKey();
  const res = await api.search({ query: "haru", kind: "tracks", offset: 0 });
  assert.deepEqual(
    res.tracks.map((t: { name: string }) => t.name),
    ["Haruhikage"],
  );
  assert.equal(res.more, false);
  assert.deepEqual(await api.search({ query: " ", kind: "tracks", offset: 0 }), { more: false });
  assert.deepEqual(await api.suggest({ query: "Shi" }), ["Shiori"]);
});

for (const [how, open] of [
  ["an API key, which Jellyfin won't move entries for", () => withKey()],
  ["a password", () => load({ settings: { server: fake.url, username: "bob", password: "pw" } })],
] as const)
  test(`playlists with ${how}: create, add, move, remove`, async () => {
    const { api } = await open();
    const list = await api.createPlaylist({ name: "Mine" });
    assert.equal(list.name, "Mine");
    await api.addToPlaylist({ id: list.id, trackIds: ["s1", "s2", "s3"] });
    await api.movePlaylistTrack({ id: list.id, from: 2, to: 0 });
    const ids = async () => (await api.playlist({ id: list.id })).tracks.map((t: { id: string }) => t.id);
    assert.deepEqual(await ids(), ["s3", "s1", "s2"]);
    await api.removeFromPlaylist({ id: list.id, trackIds: ["s1"] });
    assert.deepEqual(await ids(), ["s3", "s2"]);
    const lists = await api.playlists();
    assert.equal(lists.find((p: { id: string }) => p.id === list.id).mine, true);
  });

test("songs play as the files are when the app can, else transcoded", async () => {
  const { api } = await withKey();
  const alac = await api.stream({ id: "s1", quality: "lossless" });
  assert.equal(alac.type, "m4a");
  assert.equal(alac.quality, "lossless");
  assert.equal(alac.size, 1234);
  assert.equal(alac.url, `${fake.url}/Audio/s1/stream?static=true&MediaSourceId=ms-s1`);
  assert.deepEqual(alac.headers, { authorization: `MediaBrowser Token="${KEY}"` });
  const opus = await api.stream({ id: "s3", quality: "lossless" });
  assert.equal(opus.type, "mp3");
  assert.match(opus.url, /\/Audio\/s3\/stream\.mp3\?.*AudioCodec=mp3&AudioBitrate=320000/);
  const mp3 = await api.stream({ id: "s4", quality: "high" });
  assert.equal(mp3.url, `${fake.url}/Audio/s4/stream?static=true&MediaSourceId=ms-s4`);
  const small = await api.stream({ id: "s2", quality: "standard" });
  assert.match(small.url, /stream\.mp3\?.*AudioBitrate=128000/);
  await assert.rejects(() => api.stream({ id: "gone" }), code("unavailable"));
});

test("timed lyrics, with translations; none for a song without", async () => {
  const { api } = await withKey();
  assert.deepEqual(await api.lyrics({ id: "s1" }), {
    lines: [
      { start: 0, end: 0, text: "Credits" },
      { start: 12_000, end: 15_000, text: "Kimi no te", translation: "Your hand" },
      { start: 15_000, end: 18_000, text: "Haruhikage" },
    ],
  });
  assert.equal(await api.lyrics({ id: "s2" }), null);
  // Jellyfin's, with words timed.
  assert.deepEqual(await api.lyrics({ id: "s4" }), {
    lines: [
      {
        start: 1000,
        end: 0,
        text: "Shiori",
        translation: "Bookmark",
        words: [
          { text: "Shi", start: 1000, end: 1500 },
          { text: "ori", start: 1500, end: 2000 },
        ],
      },
      { start: 3000, end: 0, text: "End" },
    ],
  });
});

test("stations leave out what has nothing to play", async () => {
  const { api } = await withKey();
  const ids = (await api.stations()).map((s: { id: string }) => s.id);
  assert.ok(ids.includes("shuffle"));
  assert.ok((await api.stationNext({ id: "shuffle" })).length > 0);
});

test("plugin.json and the locales ship, and every text and setting has its Chinese", async () => {
  const manifest = JSON.parse(await readFile(join(dist, "plugin.json"), "utf8"));
  assert.equal(manifest.main, "index.js");
  const locale = JSON.parse(await readFile(join(dist, "locales/zh-CN.json"), "utf8")) as Record<string, string>;
  const source = await readFile(join(dist, "index.js"), "utf8");
  const texts = [...source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\)/g)].map((m) => JSON.parse(`"${m[1]}"`));
  const titles = (manifest.navigation as { title?: string }[]).map((n) => n.title).filter(Boolean);
  const settings = (manifest.settings as { label: string; help?: string }[]).flatMap((s) => [s.label, s.help]);
  assert.ok(texts.length > 20);
  for (const text of [...texts, ...titles, ...settings].filter(Boolean)) {
    assert.ok(locale[text!], `no Chinese for ${JSON.stringify(text)}`);
  }
  const { api } = await load({ language: "zh-CN" });
  await assert.rejects(() => api.home(), /请在插件设置里填写服务器地址/);
});
