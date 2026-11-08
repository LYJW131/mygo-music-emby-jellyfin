// Lyrics. Emby keeps them as a song's subtitles, from an .lrc beside the file
// or the lyrics in its tags; Jellyfin as a lyric stream of their own, which
// may time each word. Only timed ones are given: the app shows lines as the
// song reaches them, and untimed lyrics would all show at once.

import { api, text } from "./emby.ts";
import type { Item, JellyfinLyrics, TrackEvent } from "./types/emby.ts";
import type { LyricLine, Lyrics } from "./types/music.ts";
import { ticksToMs } from "./util.ts";

interface Timed {
  text: string;
  start: number;
  end?: number;
  words?: LyricLine["words"];
}

/**
 * Lines from timed text. Two at the same time are a line and its
 * translation, as an .lrc with translations gives them.
 */
function pair(timed: Timed[]): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const l of timed) {
    const words = l.text.trim();
    if (!words) continue;
    const last = lines[lines.length - 1];
    if (last && last.start === l.start && !last.translation) {
      last.translation = words;
      continue;
    }
    const line: LyricLine = { start: l.start, end: l.end && l.end > l.start ? l.end : 0, text: words };
    if (l.words?.length) line.words = l.words;
    lines.push(line);
  }
  return lines;
}

/** Emby's subtitle events. */
export const toLines = (events: TrackEvent[]): LyricLine[] =>
  pair(
    events
      .filter((e) => e.StartPositionTicks !== undefined)
      .map((e) => ({
        text: e.Text ?? "",
        start: ticksToMs(e.StartPositionTicks),
        end: ticksToMs(e.EndPositionTicks),
      })),
  );

/** Jellyfin's lyrics, with a word's time where its cues give one. */
export function fromJellyfin(body: JellyfinLyrics): LyricLine[] {
  const timed = (body.Lyrics ?? [])
    .filter((l) => l.Start !== undefined && l.Start !== null)
    .map((l): Timed => {
      const text = l.Text ?? "";
      const cues = (l.Cues ?? []).filter((c) => c.EndPosition > c.Position);
      // A cue without an end lasts until the next one starts.
      const words = cues.map((c, i) => ({
        text: text.slice(c.Position, c.EndPosition),
        start: ticksToMs(c.Start),
        end: ticksToMs(c.End ?? cues[i + 1]?.Start ?? c.Start + 5_000_000),
      }));
      return { text, start: ticksToMs(l.Start!), words: words.length ? words : undefined };
    });
  return timed.some((l) => l.start > 0) ? pair(timed) : [];
}

async function fromSubtitles(id: string, item: Item): Promise<Lyrics | null> {
  const source = item.MediaSources?.[0];
  const subs = (source?.MediaStreams ?? []).filter((s) => s.Type === "Subtitle");
  // An .lrc someone put beside the song first: it's more often timed than the tags.
  subs.sort((a, b) => Number(!!b.IsExternal) - Number(!!a.IsExternal));
  for (const sub of subs) {
    const body = await text(
      `/Items/${encodeURIComponent(id)}/${encodeURIComponent(source!.Id)}/Subtitles/${sub.Index}/Stream.js`,
    );
    if (!body) continue;
    const events = (JSON.parse(body.replace(/^﻿/, "")) as { TrackEvents?: TrackEvent[] }).TrackEvents ?? [];
    if (events.some((e) => (e.StartPositionTicks ?? 0) > 0)) {
      const lines = toLines(events);
      if (lines.length) return { lines };
    }
    // Tags sometimes hold an .lrc that Emby read as plain text.
    const plain = events.map((e) => e.Text ?? "").join("\n");
    if (/\[\d+:\d+(?:[.:]\d+)?\]/.test(plain)) return { lrc: plain };
  }
  return null;
}

export async function lyrics({ id }: { id: string }): Promise<Lyrics | null> {
  try {
    const item = await api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`, { Fields: "MediaSources" });
    const streams = item.MediaSources?.[0]?.MediaStreams ?? [];
    if (item.HasLyrics || streams.some((s) => s.Type === "Lyric")) {
      const body = await text(`/Audio/${encodeURIComponent(id)}/Lyrics`);
      const lines = body ? fromJellyfin(JSON.parse(body) as JellyfinLyrics) : [];
      return lines.length ? { lines } : null;
    }
    return await fromSubtitles(id, item);
  } catch {
    // A song plays on without its words.
    return null;
  }
}
