// What Emby calls things, as the app calls them.

import { server } from "./emby.ts";
import type { Item, NameId } from "./types/emby.ts";
import type { Album, Artist, Playlist, Track } from "./types/music.ts";
import { ticksToMs } from "./util.ts";

/**
 * A picture of an item, at the size the app shows it: Emby scales it. The tag
 * changes with the picture, so the app's cache knows a new one.
 */
export function image(id: string | undefined, tag: string | undefined, kind = "Items"): string | undefined {
  if (!id || !tag) return undefined;
  return `${server()}/${kind}/${encodeURIComponent(id)}/Images/Primary?tag=${encodeURIComponent(tag)}&maxWidth={size}&maxHeight={size}&quality=90`;
}

const artistOf = (a: NameId): Artist => ({ id: a.Id, name: a.Name });

/** Who made a song: Emby's linked artists, else the names it read from the tags. */
function artistsOf(item: Item): Artist[] {
  if (item.ArtistItems?.length) return item.ArtistItems.map(artistOf);
  if (item.AlbumArtists?.length) return item.AlbumArtists.map(artistOf);
  return (item.Artists ?? []).map((name) => ({ id: `name:${name}`, name }));
}

export function toTrack(item: Item): Track {
  const albumArtists = item.AlbumArtists?.length ? item.AlbumArtists.map(artistOf) : undefined;
  return {
    id: item.Id,
    name: item.Name ?? "",
    artists: artistsOf(item),
    album: {
      id: item.AlbumId ?? "",
      name: item.Album ?? "",
      imageUrl: image(item.AlbumId, item.AlbumPrimaryImageTag) ?? image(item.Id, item.ImageTags?.Primary),
      artists: albumArtists,
    },
    duration: ticksToMs(item.RunTimeTicks),
  };
}

export const tracksOf = (items: Item[] | undefined): Track[] =>
  (items ?? []).filter((i) => i.Type === "Audio" || i.MediaType === "Audio").map(toTrack);

function released(item: Item): string | undefined {
  if (item.PremiereDate) return item.PremiereDate.slice(0, 10);
  return item.ProductionYear ? String(item.ProductionYear) : undefined;
}

export function toAlbum(item: Item): Album {
  return {
    id: item.Id,
    name: item.Name ?? "",
    imageUrl: image(item.Id, item.ImageTags?.Primary),
    artists: item.AlbumArtists?.length
      ? item.AlbumArtists.map(artistOf)
      : item.AlbumArtist
        ? [{ id: `name:${item.AlbumArtist}`, name: item.AlbumArtist }]
        : [],
    released: released(item),
  };
}

export function toArtist(item: Item): Artist {
  return { id: item.Id, name: item.Name ?? "", imageUrl: image(item.Id, item.ImageTags?.Primary) };
}

export function toPlaylist(item: Item): Playlist {
  return {
    id: item.Id,
    name: item.Name ?? "",
    imageUrl: image(item.Id, item.ImageTags?.Primary),
    description: item.Overview ?? "",
    trackCount: item.ChildCount || undefined,
    // Playlists on an Emby server are the user's to change.
    mine: true,
  };
}
