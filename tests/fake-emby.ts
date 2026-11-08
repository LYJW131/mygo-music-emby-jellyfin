// A small stand-in for an Emby server, enough of its API for the plugin's
// tests to run without one: two users, a few songs on one album, and
// playlists and favorites kept in memory.

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { Item } from "../src/types/emby.ts";

export const KEY = "testkey";
export const users = [
  { Id: "u-alice", Name: "alice", PrimaryImageTag: "pic", Policy: { IsAdministrator: true } },
  { Id: "u-bob", Name: "Bob", Policy: { IsAdministrator: false } },
];
const tokens = new Map<string, string>([["bobtoken", "u-bob"]]);

const song = (id: string, name: string, index: number, container: string, codec: string, bitRate: number): Item => ({
  Id: id,
  Name: name,
  Type: "Audio",
  MediaType: "Audio",
  IndexNumber: index,
  RunTimeTicks: 2_000_000_000,
  Album: "Hekiten Banka",
  AlbumId: "a1",
  AlbumPrimaryImageTag: "cover",
  AlbumArtists: [{ Name: "MyGO!!!!!", Id: "ar1" }],
  ArtistItems: [{ Name: "MyGO!!!!!", Id: "ar1" }],
  MediaSources: [
    {
      Id: `ms-${id}`,
      Container: container,
      Size: 1234,
      Bitrate: bitRate,
      MediaStreams: [
        { Type: "Audio", Codec: codec, Index: 0, BitRate: bitRate },
        ...(id === "s1" ? [{ Type: "Subtitle", Codec: "lrc", Index: 2, IsExternal: true }] : []),
        ...(id === "s4" ? [{ Type: "Lyric", Index: 1 }] : []),
      ],
    },
  ],
});

export function library() {
  const items: Item[] = [
    song("s1", "Haruhikage", 1, "m4a", "alac", 900_000),
    song("s2", "Mayoiuta", 2, "flac", "flac", 1_000_000),
    song("s3", "Hekitenbanka", 3, "ogg", "opus", 160_000),
    song("s4", "Shiori", 4, "mp3", "mp3", 320_000),
    {
      Id: "a1",
      Name: "Hekiten Banka",
      Type: "MusicAlbum",
      ProductionYear: 2023,
      ImageTags: { Primary: "cover" },
      AlbumArtists: [{ Name: "MyGO!!!!!", Id: "ar1" }],
    },
    { Id: "ar1", Name: "MyGO!!!!!", Type: "MusicArtist", ImageTags: { Primary: "band" } },
  ];
  return items;
}

export interface Fake {
  url: string;
  requests: { method: string; path: string; query: URLSearchParams; headers: IncomingMessage["headers"] }[];
  favorites: Set<string>;
  played: Map<string, string>;
  playlists: Map<string, { name: string; entries: { entry: string; id: string }[] }>;
  close(): Promise<void>;
}

export async function startFake(): Promise<Fake> {
  const items = library();
  const fake: Omit<Fake, "url" | "close"> = {
    requests: [],
    favorites: new Set(["s2"]),
    played: new Map(),
    playlists: new Map(),
  };
  let entries = 0;
  const byId = (id: string): Item | undefined => {
    const list = fake.playlists.get(id);
    if (list) return { Id: id, Name: list.name, Type: "Playlist", ChildCount: list.entries.length };
    return items.find((i) => i.Id === id);
  };
  const withUserData = (i: Item): Item => ({
    ...i,
    UserData: { IsFavorite: fake.favorites.has(i.Id), Played: fake.played.has(i.Id) },
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const q = url.searchParams;
    const path = url.pathname;
    fake.requests.push({ method: req.method!, path, query: q, headers: req.headers });
    let body = "";
    for await (const chunk of req) body += chunk;
    const send = (status: number, value?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(value === undefined ? "" : JSON.stringify(value));
    };

    if (path === "/Users/AuthenticateByName" && req.method === "POST") {
      const { Username, Pw } = JSON.parse(body);
      if (Username.toLowerCase() === "bob" && Pw === "pw")
        return send(200, { AccessToken: "bobtoken", User: users[1] });
      return send(401);
    }
    // Only the standard header, as Jellyfin 12 takes it.
    const token = (req.headers.authorization ?? "").match(/^MediaBrowser .*Token="([^"]*)"/)?.[1];
    if (token !== KEY && !tokens.has(token ?? "")) return send(401);

    if (path === "/Users") return send(200, users);
    if (path === "/Artists/AlbumArtists" || path === "/Artists") {
      const found = items.filter((i) => i.Type === "MusicArtist");
      return send(200, { Items: found, TotalRecordCount: found.length });
    }
    if (path === "/MusicGenres") return send(200, { Items: [{ Id: "g1", Name: "Rock", Type: "MusicGenre" }] });
    let m = path.match(/^\/Users\/([^/]+)$/);
    if (m)
      return send(
        200,
        users.find((u) => u.Id === m![1]),
      );
    if (path.match(/^\/Users\/[^/]+\/Items$/)) {
      let found = items.map(withUserData);
      const types = q.get("IncludeItemTypes")?.split(",");
      if (types) found = found.filter((i) => types.includes(i.Type!));
      if (types?.includes("Playlist"))
        found = [...fake.playlists.keys()].map((id) => byId(id)!).filter((i) => types.includes(i.Type!));
      const ids = q.get("Ids")?.split(",");
      if (ids) found = items.filter((i) => ids.includes(i.Id)).map(withUserData);
      const filters = q.get("Filters") ?? "";
      if (filters.includes("IsFavorite")) found = found.filter((i) => fake.favorites.has(i.Id));
      if (filters.includes("IsPlayed")) found = found.filter((i) => fake.played.has(i.Id));
      if (filters.includes("IsUnplayed")) found = found.filter((i) => !fake.played.has(i.Id));
      if (q.get("ParentId")) found = found.filter((i) => i.AlbumId === q.get("ParentId"));
      const term = q.get("SearchTerm")?.toLowerCase();
      if (term) found = found.filter((i) => i.Name!.toLowerCase().includes(term));
      const start = Number(q.get("StartIndex") ?? 0);
      const limit = Number(q.get("Limit") ?? 1000);
      return send(200, { Items: found.slice(start, start + limit), TotalRecordCount: term ? 0 : found.length });
    }
    m = path.match(/^\/Users\/[^/]+\/Items\/([^/]+)$/);
    if (m) {
      const item = byId(m[1]);
      return item ? send(200, withUserData(item)) : send(404);
    }
    m = path.match(/^\/Users\/[^/]+\/FavoriteItems\/([^/]+)$/);
    if (m) {
      if (req.method === "POST") fake.favorites.add(m[1]);
      else fake.favorites.delete(m[1]);
      return send(200, {});
    }
    m = path.match(/^\/Users\/[^/]+\/PlayedItems\/([^/]+)$/);
    if (m) {
      fake.played.set(m[1], q.get("DatePlayed") ?? "");
      return send(200, {});
    }
    if (path === "/Audio/s4/Lyrics") {
      return send(200, {
        Metadata: {},
        Lyrics: [
          {
            Text: "Shiori",
            Start: 10_000_000,
            Cues: [
              { Position: 0, EndPosition: 3, Start: 10_000_000, End: 15_000_000 },
              { Position: 3, EndPosition: 6, Start: 15_000_000 },
            ],
          },
          { Text: "Bookmark", Start: 10_000_000, Cues: [] },
          { Text: "End", Start: 30_000_000, Cues: [] },
        ],
      });
    }
    if (path === "/Items/s1/ms-s1/Subtitles/2/Stream.js") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        "﻿" +
          JSON.stringify({
            TrackEvents: [
              { Text: "Credits", StartPositionTicks: 0, EndPositionTicks: 0 },
              { Text: "Kimi no te", StartPositionTicks: 120_000_000, EndPositionTicks: 150_000_000 },
              { Text: "Your hand", StartPositionTicks: 120_000_000, EndPositionTicks: 150_000_000 },
              { Text: "Haruhikage", StartPositionTicks: 150_000_000, EndPositionTicks: 180_000_000 },
            ],
          }),
      );
    }
    if (path === "/Playlists" && req.method === "POST") {
      const id = `p${fake.playlists.size + 1}`;
      fake.playlists.set(id, { name: q.get("Name")!, entries: [] });
      return send(200, { Id: id });
    }
    m = path.match(/^\/Playlists\/([^/]+)\/Items$/);
    if (m) {
      const list = fake.playlists.get(m[1]);
      if (!list) return send(404);
      if (req.method === "POST") {
        for (const id of q.get("Ids")!.split(",")) list.entries.push({ entry: `e${++entries}`, id });
        return send(204);
      }
      if (req.method === "DELETE") {
        const gone = q.get("EntryIds")!.split(",");
        list.entries = list.entries.filter((e) => !gone.includes(e.entry));
        return send(204);
      }
      const found = list.entries.map((e) => ({ ...byId(e.id)!, PlaylistItemId: e.entry }));
      return send(200, { Items: found, TotalRecordCount: found.length });
    }
    m = path.match(/^\/Playlists\/([^/]+)\/Items\/([^/]+)\/Move\/(\d+)$/);
    if (m) {
      // As Jellyfin: an entry moves only for a signed-in user, which an API key isn't.
      if (token === KEY) return send(400, "Guid can't be empty");
      const list = fake.playlists.get(m[1])!;
      const at = list.entries.findIndex((e) => e.entry === m![2]);
      const [e] = list.entries.splice(at, 1);
      list.entries.splice(Number(m[3]), 0, e);
      return send(204);
    }
    send(404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    ...fake,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
