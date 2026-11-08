// Pieces of the plugin on their own: the server address, the user an API key
// acts as, how a song plays, and lyrics.

import assert from "node:assert/strict";
import { test } from "node:test";
import { pickUser, serverURL } from "../src/emby.ts";
import { toLines } from "../src/lyrics.ts";
import { choose, playable } from "../src/stream.ts";

const settings: Record<string, string> = {};
(globalThis as { host?: unknown }).host = { setting: (k: string) => settings[k] ?? "", t: (s: string) => s };

test("the server address is made whole", () => {
  for (const [given, want] of [
    ["192.168.3.42", "http://192.168.3.42:8096"],
    ["192.168.3.42:9000/", "http://192.168.3.42:9000"],
    ["nas.local/emby", "http://nas.local:8096/emby"],
    ["https://emby.example.com/", "https://emby.example.com"],
    ["http://[::1]:8096", "http://[::1]:8096"],
  ]) {
    settings.server = given;
    assert.equal(serverURL(), want, given);
  }
});

test("an API key acts as the user named, the only one, or the first administrator", () => {
  const a = { Id: "a", Name: "Ann" };
  const b = { Id: "b", Name: "Ben", Policy: { IsAdministrator: true } };
  const off = { Id: "c", Name: "Cy", Policy: { IsDisabled: true, IsAdministrator: true } };
  assert.equal(pickUser([a, b], "").Id, "b");
  assert.equal(pickUser([a, off], "").Id, "a");
  assert.equal(pickUser([a, b], "ann").Id, "a");
  assert.throws(() => pickUser([a, b], "zed"));
});

test("what plays as it is, and what's transcoded", () => {
  assert.equal(playable("m4a", "alac"), "m4a");
  assert.equal(playable("ogg", "opus"), undefined);
  assert.equal(playable("wma", "wmav2"), undefined);
  const src = (Container: string, Codec: string, BitRate: number) => ({
    Id: "m",
    Container,
    MediaStreams: [{ Type: "Audio", Codec, Index: 0, BitRate }],
  });
  assert.deepEqual(choose(src("flac", "flac", 900_000), "lossless"), {
    direct: "flac",
    quality: "lossless",
    bitRate: 900_000,
  });
  assert.deepEqual(choose(src("flac", "flac", 900_000), ""), { direct: "flac", quality: "lossless", bitRate: 900_000 });
  assert.deepEqual(choose(src("ape", "ape", 900_000), "lossless"), { codec: "flac", quality: "lossless" });
  assert.deepEqual(choose(src("flac", "flac", 900_000), "high"), { codec: "mp3", bitRate: 320_000, quality: "high" });
  assert.deepEqual(choose(src("mp3", "mp3", 320_000), "high"), { direct: "mp3", quality: "high", bitRate: 320_000 });
  assert.deepEqual(choose(src("mp3", "mp3", 320_000), "standard"), {
    codec: "mp3",
    bitRate: 128_000,
    quality: "standard",
  });
  assert.deepEqual(choose(src("m4a", "aac", 256_000), "lossless"), {
    direct: "m4a",
    quality: "high",
    bitRate: 256_000,
  });
});

test("lyrics events become lines, a second at the same time its translation", () => {
  assert.deepEqual(
    toLines([
      { Text: "a", StartPositionTicks: 10_000_000, EndPositionTicks: 20_000_000 },
      { Text: "A", StartPositionTicks: 10_000_000 },
      { Text: " ", StartPositionTicks: 15_000_000 },
      { Text: "b", StartPositionTicks: 20_000_000 },
    ]),
    [
      { start: 1000, end: 2000, text: "a", translation: "A" },
      { start: 2000, end: 0, text: "b" },
    ],
  );
});
