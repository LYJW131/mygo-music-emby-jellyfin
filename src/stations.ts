// Stations: endless shuffles of the library, each a little different.

import { items, songs } from "./library.ts";
import type { Station, Track } from "./types/music.ts";
import { fail, t } from "./util.ts";

const NEXT = 20;

interface Kind {
  name: string;
  description: string;
  filters?: string;
}

const kinds = (): Record<string, Kind> => ({
  shuffle: { name: t("Shuffle All"), description: t("Everything on the server, in no order") },
  favorites: { name: t("Favorites Shuffle"), description: t("The songs you love, shuffled"), filters: "IsFavorite" },
  unplayed: { name: t("Never Played"), description: t("Songs you haven't heard here yet"), filters: "IsUnplayed" },
  rediscover: { name: t("Rediscover"), description: t("Songs you've played before"), filters: "IsPlayed" },
});

export async function stations(): Promise<Station[]> {
  const all = kinds();
  // A station with nothing to play isn't offered.
  const counts = await Promise.all(
    Object.values(all).map(async (k) =>
      k.filters ? (await items({ IncludeItemTypes: "Audio", Filters: k.filters, Limit: 1 })).Items.length : 1,
    ),
  );
  return Object.entries(all)
    .filter((_, i) => counts[i] > 0)
    .map(([id, k]) => ({ id, name: k.name, description: k.description }));
}

export async function stationNext({ id }: { id: string }): Promise<Track[]> {
  const kind = kinds()[id];
  if (!kind) throw fail("unavailable", id);
  return songs({ Filters: kind.filters, SortBy: "Random", Limit: NEXT });
}
