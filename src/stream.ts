// Playing a song. The file as it is on the server where the app can play it
// and it fits the quality asked for, so ALAC and FLAC play bit for bit;
// otherwise Emby transcodes it, to FLAC for lossless and MP3 below that.

import { api, audioHeaders, query, server } from "./emby.ts";
import type { Item, MediaSource } from "./types/emby.ts";
import type { Stream } from "./types/music.ts";
import { fail, randomHex, t } from "./util.ts";

type Type = Stream["type"];

const LOSSLESS = new Set(["flac", "alac", "pcm_s16le", "pcm_s24le", "pcm_s32le", "ape", "wavpack", "tta", "dsd"]);

/** Bit rates of the qualities below lossless. */
const CAPS: Record<string, number> = { high: 320_000, standard: 128_000 };

/** What the app can play of a file as it is, by its container and codec. */
export function playable(container: string, codec: string): Type | undefined {
  switch (container) {
    case "mp3":
      return codec === "mp3" || !codec ? "mp3" : undefined;
    case "flac":
      return codec === "flac" || !codec ? "flac" : undefined;
    case "m4a":
    case "mp4":
    case "m4b":
    case "mov":
      return ["alac", "aac", "flac"].includes(codec) ? "m4a" : undefined;
    case "ogg":
    case "oga":
      return codec === "vorbis" ? "ogg" : undefined;
    case "wav":
      return codec.startsWith("pcm_") || !codec ? "wav" : undefined;
    case "aac":
      return "aac";
  }
  return undefined;
}

export interface Choice {
  direct?: Type;
  /** Transcoded: to this codec at this bit rate, or FLAC when there's no rate. */
  codec?: "flac" | "mp3";
  bitRate?: number;
  quality: string;
}

/** How to play a source at the quality the app asked for. */
export function choose(source: MediaSource, quality = ""): Choice {
  const audio = source.MediaStreams?.find((s) => s.Type === "Audio");
  const container = (source.Container ?? "").toLowerCase().split(",")[0];
  const codec = (audio?.Codec ?? "").toLowerCase();
  const direct = playable(container, codec);
  const lossless = LOSSLESS.has(codec) || codec.startsWith("pcm_");
  const rate = audio?.BitRate || source.Bitrate || 0;
  const cap = CAPS[quality];
  if (!cap) {
    // Lossless, or the app didn't say: the file itself if it can.
    if (direct) return { direct, quality: lossless ? "lossless" : "high", bitRate: rate || undefined };
    return lossless ? { codec: "flac", quality: "lossless" } : { codec: "mp3", bitRate: CAPS.high, quality: "high" };
  }
  if (direct && !lossless && rate > 0 && rate <= cap * 1.05) return { direct, quality, bitRate: rate };
  return { codec: "mp3", bitRate: cap, quality };
}

export async function stream({ id, quality }: { id: string; quality?: string }): Promise<Stream> {
  const item = await api<Item>(`/Users/{user}/Items/${encodeURIComponent(id)}`, { Fields: "MediaSources" });
  const source = item.MediaSources?.[0];
  if (!source) throw fail("unavailable", t("The server has no file for this song."));
  const how = choose(source, quality);
  const base = `${server()}/Audio/${encodeURIComponent(id)}`;
  if (how.direct) {
    return {
      url: `${base}/stream${query({ static: true, MediaSourceId: source.Id })}`,
      type: how.direct,
      quality: how.quality,
      bitRate: how.bitRate,
      size: source.Size,
      headers: audioHeaders(),
    };
  }
  const params = {
    MediaSourceId: source.Id,
    AudioCodec: how.codec,
    AudioBitrate: how.bitRate,
    MaxAudioChannels: 2,
    PlaySessionId: randomHex(16),
  };
  return {
    url: `${base}/stream.${how.codec}${query(params)}`,
    type: how.codec === "flac" ? "flac" : "mp3",
    quality: how.quality,
    bitRate: how.bitRate,
    headers: audioHeaders(),
  };
}
