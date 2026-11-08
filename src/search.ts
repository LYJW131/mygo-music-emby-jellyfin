// Search over the user's libraries. Emby doesn't count what a search finds,
// so a full page means there may be more.

import { api } from "./emby.ts";
import { items } from "./library.ts";
import { toAlbum, toArtist, toPlaylist, tracksOf } from "./models.ts";
import type { Items } from "./types/emby.ts";
import type { SearchKind, SearchResult } from "./types/music.ts";
import { fail } from "./util.ts";

const LIMIT = 50;

export async function search({
  query,
  kind,
  offset = 0,
}: {
  query: string;
  kind: SearchKind;
  offset?: number;
}): Promise<SearchResult> {
  const term = query.trim();
  if (!term) return { more: false };
  const page = { SearchTerm: term, StartIndex: offset, Limit: LIMIT };
  switch (kind) {
    case "tracks": {
      const res = await items({ IncludeItemTypes: "Audio", ...page });
      return { tracks: tracksOf(res.Items), more: res.Items.length === LIMIT };
    }
    case "albums": {
      const res = await items({ IncludeItemTypes: "MusicAlbum", ...page });
      return { albums: res.Items.map(toAlbum), more: res.Items.length === LIMIT };
    }
    case "artists": {
      const res = await api<Items>("/Artists", { UserId: "{user}", Recursive: true, ...page });
      return { artists: res.Items.map(toArtist), more: res.Items.length === LIMIT };
    }
    case "playlists": {
      const res = await items({ IncludeItemTypes: "Playlist", ...page });
      return { playlists: res.Items.map(toPlaylist), more: res.Items.length === LIMIT };
    }
  }
  throw fail("unsupported", kind);
}

export async function suggest({ query }: { query: string }): Promise<string[]> {
  const term = query.trim();
  if (!term) return [];
  const res = await items({ IncludeItemTypes: "Audio,MusicAlbum,MusicArtist", SearchTerm: term, Limit: 12 });
  return [...new Set(res.Items.map((i) => i.Name ?? "").filter(Boolean))].slice(0, 8);
}
