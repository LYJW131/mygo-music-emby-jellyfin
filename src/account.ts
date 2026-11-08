// The account menu: who the plugin is on the server.

import * as emby from "./emby.ts";
import { image } from "./models.ts";
import type { Account } from "./types/music.ts";
import { codeOf } from "./util.ts";

const SETTINGS = new Set(["server", "apiKey", "username", "password"]);

async function current(): Promise<Account> {
  const s = await emby.session();
  return { id: s.userId, name: s.name, imageUrl: image(s.userId, s.imageTag, "Users") };
}

/** Null until the settings say where the server is and who to be, or after signing out. */
export async function account(): Promise<Account | null> {
  if (emby.isSignedOut()) return null;
  try {
    return await current();
  } catch (e) {
    if (codeOf(e) === "setup" || codeOf(e) === "signIn") return null;
    throw e;
  }
}

/** Signing in uses the settings: one missing or refused sends the listener there. */
export async function signIn(): Promise<Account> {
  emby.signedIn();
  emby.forget();
  return current();
}

export function signOut(): void {
  emby.signOut();
}

export function setSetting({ key }: { key: string; value: string }): void {
  if (SETTINGS.has(key)) emby.forget();
}
