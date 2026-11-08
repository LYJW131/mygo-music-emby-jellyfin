/**
 * What the app does with an error a plugin throws, by its code: signIn asks
 * the listener to sign in, setup sends them to the plugin's settings,
 * unavailable and unsupported say so. Without a code it's shown as it is.
 */
export type FailCode = "signIn" | "setup" | "unavailable" | "unsupported";

export interface CodedError extends Error {
  code?: FailCode;
}

export function fail(code: FailCode, message?: string): CodedError {
  const e: CodedError = new Error(message || code);
  e.code = code;
  return e;
}

export const codeOf = (e: unknown): FailCode | undefined => (e as CodedError | null)?.code;

/** The text in the listener's language. */
export const t = (text: string): string => host.t(text);

/** Emby counts time in ticks of 100 ns. */
export const ticksToMs = (ticks: number | undefined): number => Math.round((ticks ?? 0) / 10_000);

/** A short hash, to tell settings apart without keeping them twice. */
export function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const randomHex = (n: number): string =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
