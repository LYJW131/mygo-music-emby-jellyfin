// Pages: Home, an album, an artist, and the plugin's own pages by name.

import { api, server, userId } from "./emby.ts";
import { items, playlists, recent, songs } from "./library.ts";
import { image, toAlbum, toArtist, tracksOf } from "./models.ts";
import type { Item, Items } from "./types/emby.ts";
import type { AlbumPage, ArtistPage, Browse, Section, Track } from "./types/music.ts";
import { fail, t } from "./util.ts";

const MIX = 30;

export async function album({ id }: { id: string }): Promise<AlbumPage> {
  const [item, tracks] = await Promise.all([
    api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`),
    songs({ ParentId: id, SortBy: "ParentIndexNumber,IndexNumber,SortName", Limit: 5000 }),
  ]);
  return { album: toAlbum(item), tracks };
}

/** An artist by ID, or by name where a song's tags named one Emby didn't link. */
const artistItem = (id: string): Promise<Item> =>
  id.startsWith("name:")
    ? api<Item>(`/Artists/${encodeURIComponent(id.slice(5))}`, { UserId: "{user}" })
    : api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`);

export async function artist({ id }: { id: string }): Promise<ArtistPage> {
  const item = await artistItem(id);
  const albumsBy = (key: string) =>
    items({
      IncludeItemTypes: "MusicAlbum",
      [key]: item.Id,
      SortBy: "ProductionYear,PremiereDate,SortName",
      SortOrder: "Descending",
      Limit: 500,
    });
  const [tracks, own] = await Promise.all([
    songs({ ArtistIds: item.Id, SortBy: "PlayCount,SortName", SortOrder: "Descending", Limit: 50 }),
    albumsBy("AlbumArtistIds"),
  ]);
  // Someone who only sings on others' albums has those instead.
  const albums = own.Items.length ? own : await albumsBy("ArtistIds");
  return { artist: toArtist(item), tracks, albums: albums.Items.map(toAlbum) };
}

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * Today's songs, picked at random once a day and kept, so Home's card holds
 * the same ones until tomorrow. Only their IDs are kept: what they're called
 * is asked of the server each time.
 */
async function dailyMix(): Promise<Track[]> {
  const owner = `${server()} ${userId()}`;
  const kept = host.storage.get<{ day: string; owner: string; ids: string[] }>("daily");
  if (kept?.day === today() && kept.owner === owner && kept.ids.length) {
    const res = await items({ Ids: kept.ids.join(",") });
    const byId = new Map(tracksOf(res.Items).map((tr) => [tr.id, tr]));
    const tracks = kept.ids.map((id) => byId.get(id)).filter((tr): tr is Track => !!tr);
    if (tracks.length) return tracks;
  }
  const tracks = await songs({ SortBy: "Random", Limit: MIX });
  host.storage.set("daily", { day: today(), owner, ids: tracks.map((tr) => tr.id) });
  return tracks;
}

const albumArtists = (params: Record<string, string | number>): Promise<Items> =>
  api<Items>("/Artists/AlbumArtists", { UserId: "{user}", Recursive: true, ...params });

export async function home(): Promise<Browse> {
  const [mix, played, added, most, lists, randomAlbums, artists] = await Promise.all([
    dailyMix(),
    recent(20),
    items({ IncludeItemTypes: "MusicAlbum", SortBy: "DateCreated", SortOrder: "Descending", Limit: 20 }),
    songs({ Filters: "IsPlayed", SortBy: "PlayCount", SortOrder: "Descending", Limit: 20 }),
    playlists(),
    items({ IncludeItemTypes: "MusicAlbum", SortBy: "Random", Limit: 20 }),
    albumArtists({ SortBy: "Random", Limit: 20 }),
  ]);
  const sections: Section[] = [
    {
      title: t("Today's Mix"),
      subtitle: t("Picked from your library, new every day"),
      tracks: mix,
      empty: t("There's no music on the server yet."),
    },
  ];
  if (played.length) sections.push({ title: t("Recently Played"), tracks: played, morePage: "recentlyPlayed" });
  if (added.Items.length)
    sections.push({ title: t("Recently Added"), albums: added.Items.map(toAlbum), morePage: "recentlyAdded" });
  if (most.length) sections.push({ title: t("Most Played"), tracks: most, morePage: "mostPlayed" });
  if (lists.length) sections.push({ title: t("Playlists"), playlists: lists });
  if (randomAlbums.Items.length)
    sections.push({ title: t("Albums to Explore"), albums: randomAlbums.Items.map(toAlbum) });
  if (artists.Items.length)
    sections.push({ title: t("Artists"), artists: artists.Items.map(toArtist), morePage: "artists" });
  return { sections };
}

async function genre(id: string): Promise<Browse> {
  const [item, albums, tracks] = await Promise.all([
    api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`),
    items({ IncludeItemTypes: "MusicAlbum", GenreIds: id, SortBy: "SortName", Limit: 500 }),
    songs({ GenreIds: id, SortBy: "Random", Limit: 50 }),
  ]);
  return {
    title: item.Name,
    sections: [
      { title: t("Songs"), tracks },
      { title: t("Albums"), albums: albums.Items.map(toAlbum) },
    ],
  };
}

export async function browse({ page }: { page: string }): Promise<Browse> {
  switch (page) {
    case "recentlyPlayed":
      return {
        title: t("Recently Played"),
        sections: [{ tracks: await recent(100), empty: t("Nothing played yet.") }],
      };
    case "mostPlayed": {
      const tracks = await songs({ Filters: "IsPlayed", SortBy: "PlayCount", SortOrder: "Descending", Limit: 100 });
      return { title: t("Most Played"), sections: [{ tracks, empty: t("Nothing played yet.") }] };
    }
    case "recentlyAdded": {
      const res = await items({
        IncludeItemTypes: "MusicAlbum",
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 100,
      });
      return { title: t("Recently Added"), sections: [{ albums: res.Items.map(toAlbum) }] };
    }
    case "artists": {
      const res = await albumArtists({ SortBy: "SortName", Limit: 5000 });
      return { title: t("Artists"), sections: [{ artists: res.Items.map(toArtist) }] };
    }
    case "genres": {
      const res = await api<Items>("/MusicGenres", { UserId: "{user}", Recursive: true, SortBy: "SortName" });
      const links = res.Items.map((g) => ({
        title: g.Name ?? "",
        page: `genre:${g.Id}`,
        imageUrl: image(g.Id, g.ImageTags?.Primary),
      }));
      return { title: t("Genres"), sections: [{ links, empty: t("The server has no genres.") }] };
    }
  }
  if (page.startsWith("genre:")) return genre(page.slice(6));
  throw fail("unsupported", page);
}
