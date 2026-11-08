// The user's music on the server: favorites, albums, what they played, and
// their playlists.

import { api, type Params } from "./emby.ts";
import { toAlbum, toPlaylist, tracksOf } from "./models.ts";
import type { Item, Items } from "./types/emby.ts";
import type { Album, Playlist, Track } from "./types/music.ts";
import { codeOf, t } from "./util.ts";

export const PAGE = 100;

/** The user's items of a kind, from every library they can see. */
export const items = (params: Params): Promise<Items> =>
  api<Items>("/Users/{user}/Items", { Recursive: true, ...params });

export const songs = async (params: Params): Promise<Track[]> =>
  tracksOf((await items({ IncludeItemTypes: "Audio", ...params })).Items);

export async function liked({ offset = 0 }: { offset?: number }): Promise<{ tracks: Track[]; more: boolean }> {
  const res = await items({
    IncludeItemTypes: "Audio",
    Filters: "IsFavorite",
    SortBy: "AlbumArtist,Album,ParentIndexNumber,IndexNumber,SortName",
    StartIndex: offset,
    Limit: PAGE,
  });
  return { tracks: tracksOf(res.Items), more: res.Items.length === PAGE };
}

export async function isLiked({ ids }: { ids: string[] }): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = false;
  // A long list goes in pieces, so the address stays short.
  for (let i = 0; i < ids.length; i += 100) {
    const res = await items({ Ids: ids.slice(i, i + 100).join(","), Fields: "UserData" });
    for (const item of res.Items) out[item.Id] = item.UserData?.IsFavorite === true;
  }
  return out;
}

export async function like({ id, on }: { id: string; on: boolean }): Promise<void> {
  await api(`/Users/{user}/FavoriteItems/${encodeURIComponent(id)}`, {}, { method: on ? "POST" : "DELETE" });
}

/** Every album on the server is the user's: it's their own library. */
export async function savedAlbums({ offset = 0 }: { offset?: number }): Promise<{ albums: Album[]; more: boolean }> {
  const res = await items({
    IncludeItemTypes: "MusicAlbum",
    SortBy: "SortName",
    StartIndex: offset,
    Limit: PAGE,
  });
  return { albums: res.Items.map(toAlbum), more: res.Items.length === PAGE };
}

export const recent = (limit = 50): Promise<Track[]> =>
  songs({ Filters: "IsPlayed", SortBy: "DatePlayed", SortOrder: "Descending", Limit: limit });

/** Emby's time for "now": yyyyMMddHHmmss, in UTC. */
const embyNow = (): string => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

/** A song starting counts as played: its play count and when it was last played show in Emby too. */
export async function played({ id }: { id: string }): Promise<void> {
  await api(`/Users/{user}/PlayedItems/${encodeURIComponent(id)}`, { DatePlayed: embyNow() }, { method: "POST" });
}

const isAudioPlaylist = (item: Item): boolean => item.MediaType !== "Video";

export async function playlists(): Promise<Playlist[]> {
  const res = await items({ IncludeItemTypes: "Playlist", SortBy: "SortName", Fields: "ChildCount,Overview" });
  return res.Items.filter(isAudioPlaylist).map(toPlaylist);
}

/** A playlist's entries, each with the PlaylistItemId Emby moves and removes it by. */
async function entries(id: string): Promise<Item[]> {
  const all: Item[] = [];
  for (;;) {
    const res = await api<Items>(`/Playlists/${encodeURIComponent(id)}/Items`, {
      UserId: "{user}",
      StartIndex: all.length,
      Limit: 1000,
    });
    all.push(...res.Items);
    if (res.Items.length < 1000) return all;
  }
}

export async function playlist({ id }: { id: string }): Promise<Playlist> {
  const [item, list] = await Promise.all([
    api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`, { Fields: "ChildCount,Overview" }),
    entries(id),
  ]);
  const tracks = tracksOf(list);
  return { ...toPlaylist(item), trackCount: tracks.length, tracks };
}

export async function createPlaylist({ name }: { name: string }): Promise<Playlist> {
  const res = await api<{ Id: string; Name?: string }>(
    "/Playlists",
    { Name: name, MediaType: "Audio", UserId: "{user}" },
    { method: "POST" },
  );
  return { id: res.Id, name: res.Name ?? name, mine: true, trackCount: 0 };
}

export async function renamePlaylist({ id, name }: { id: string; name: string }): Promise<void> {
  // Emby changes an item by taking the whole of it back, which only an
  // administrator may do; Jellyfin lets a playlist's owner rename it alone.
  const item = await api<Record<string, unknown>>(`/Users/{user}/Items/${encodeURIComponent(id)}`);
  try {
    await api(`/Items/${encodeURIComponent(id)}`, {}, { method: "POST", body: { ...item, Name: name } });
  } catch (e) {
    if (codeOf(e) === "setup" || codeOf(e) === "signIn") throw e;
    await api(`/Playlists/${encodeURIComponent(id)}`, {}, { method: "POST", body: { Name: name } }).catch(() => {
      throw e;
    });
  }
}

export async function deletePlaylist({ id }: { id: string }): Promise<void> {
  await api(`/Items/${encodeURIComponent(id)}`, {}, { method: "DELETE" });
}

export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  for (let i = 0; i < trackIds.length; i += 100) {
    await api(
      `/Playlists/${encodeURIComponent(id)}/Items`,
      { Ids: trackIds.slice(i, i + 100).join(","), UserId: "{user}" },
      { method: "POST" },
    );
  }
}

async function removeEntries(id: string, gone: string[]): Promise<void> {
  for (let i = 0; i < gone.length; i += 100) {
    await api(
      `/Playlists/${encodeURIComponent(id)}/Items`,
      { EntryIds: gone.slice(i, i + 100).join(",") },
      { method: "DELETE" },
    );
  }
}

export async function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  const wanted = new Set(trackIds);
  const gone = (await entries(id)).filter((e) => wanted.has(e.Id) && e.PlaylistItemId).map((e) => e.PlaylistItemId!);
  await removeEntries(id, gone);
}

export async function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }): Promise<void> {
  const list = await entries(id);
  const entry = list[from]?.PlaylistItemId;
  if (!entry) throw new Error(t("That song is no longer in the playlist."));
  try {
    await api(
      `/Playlists/${encodeURIComponent(id)}/Items/${encodeURIComponent(entry)}/Move/${to}`,
      {},
      { method: "POST" },
    );
  } catch (e) {
    if (codeOf(e)) throw e;
    // Jellyfin moves an entry only for the user signed in, and an API key is
    // no one: the songs from where it changes are taken out and put back in
    // their new order instead, which an API key may do.
    await rewriteFrom(id, list, from, to);
  }
}

async function rewriteFrom(id: string, list: Item[], from: number, to: number): Promise<void> {
  const order = list.slice();
  order.splice(to, 0, ...order.splice(from, 1));
  let k = Math.min(from, to);
  // Jellyfin's entries can share an ID when a song is in twice, and taking
  // one out takes out each: then it all goes back.
  const head = new Set(list.slice(0, k).map((e) => e.PlaylistItemId));
  if (list.slice(k).some((e) => head.has(e.PlaylistItemId))) k = 0;
  await removeEntries(
    id,
    list.slice(k).map((e) => e.PlaylistItemId!),
  );
  await addToPlaylist({ id, trackIds: order.slice(k).map((e) => e.Id) });
}
