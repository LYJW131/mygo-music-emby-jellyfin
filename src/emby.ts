// Talking to the listener's Emby server: where it is, who they are on it,
// and requests made as them.
//
// There are two ways in, both from the plugin's settings. An API key, which
// an administrator makes in Emby's dashboard, speaks for the server: the
// plugin then acts as the user named in the settings, or the server's only
// or first administrator. Without one, the user name and password sign in
// the way Emby's own apps do, and the access token Emby answers is kept.

import type { User } from "./types/emby.ts";
import { fail, fnv, randomHex, t } from "./util.ts";

const VERSION = typeof PLUGIN_VERSION === "string" ? PLUGIN_VERSION : "dev";

export interface Session {
  /** A hash of the settings it was made with: they change, it's made again. */
  for: string;
  server: string;
  token: string;
  userId: string;
  name: string;
  imageTag?: string;
  /** Signed in with a password, so it can sign in again when the token runs out. */
  password: boolean;
}

let current: Session | undefined;
let connecting: Promise<Session> | undefined;

const setting = (key: string): string => host.setting(key).trim();

/**
 * The server's address as the listener wrote it, made whole: a bare host
 * gets http:// and Emby's own port, 8096.
 */
export function serverURL(): string {
  let s = setting("server");
  if (!s) throw fail("setup", t("Fill in your server's address in the plugin's settings."));
  if (!/^https?:\/\//i.test(s)) {
    s = "http://" + s;
    if (!/^http:\/\/(\[[^\]]+\]|[^/:]+):\d+/.test(s)) s = s.replace(/^(http:\/\/(?:\[[^\]]+\]|[^/:]+))/, "$1:8096");
  }
  try {
    const u = new URL(s);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    throw fail("setup", t("The server address isn't a web address, such as http://192.168.1.2:8096."));
  }
}

/** This copy of the plugin, as Emby lists it among the user's devices. */
function deviceId(): string {
  let id = host.storage.get<string>("deviceId");
  if (!id) host.storage.set("deviceId", (id = randomHex(32)));
  return id;
}

function authorization(userId = "", token = ""): Record<string, string> {
  const parts = [
    `UserId="${userId}"`,
    `Client="MyGo Music"`,
    `Device="MyGo Music (${host.platform})"`,
    `DeviceId="${deviceId()}"`,
    `Version="${VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  // The standard header, which Emby and Jellyfin both take: Jellyfin 12 turns
  // off the X-Emby-Token and X-Emby-Authorization ones by default.
  return { authorization: `MediaBrowser ${parts.join(", ")}` };
}

async function reach(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(`${t("Can't reach the server.")} (${new URL(url).host}: ${(e as Error).message})`);
  }
}

/** The user the API key acts as: the one named, else the only one, else the first administrator. */
export function pickUser(users: User[], name: string): User {
  const usable = users.filter((u) => !u.Policy?.IsDisabled);
  if (name) {
    const lower = name.toLowerCase();
    const found = usable.find((u) => u.Name.toLowerCase() === lower);
    if (!found) throw fail("setup", t("There's no user of that name on the server."));
    return found;
  }
  const user = usable.length === 1 ? usable[0] : (usable.find((u) => u.Policy?.IsAdministrator) ?? usable[0]);
  if (!user) throw fail("setup", t("The server has no users."));
  return user;
}

async function connect(sig: string): Promise<Session> {
  const server = serverURL();
  const key = setting("apiKey");
  const username = setting("username");
  let s: Session;
  if (key) {
    const res = await reach(`${server}/Users`, { headers: authorization("", key) });
    if (res.status === 401 || res.status === 403) throw fail("setup", t("The server refused the API key."));
    if (!res.ok) throw new Error(`${t("The server answered")} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const user = pickUser((await res.json()) as User[], username);
    s = {
      for: sig,
      server,
      token: key,
      userId: user.Id,
      name: user.Name,
      imageTag: user.PrimaryImageTag,
      password: false,
    };
  } else if (username) {
    const res = await reach(`${server}/Users/AuthenticateByName`, {
      method: "POST",
      headers: { ...authorization(), "content-type": "application/json" },
      body: JSON.stringify({ Username: username, Pw: host.setting("password") }),
    });
    if (res.status === 401 || res.status === 403)
      throw fail("setup", t("The server refused the user name or password."));
    if (!res.ok) throw new Error(`${t("The server answered")} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { AccessToken: string; User: User };
    s = {
      for: sig,
      server,
      token: body.AccessToken,
      userId: body.User.Id,
      name: body.User.Name,
      imageTag: body.User.PrimaryImageTag,
      password: true,
    };
  } else {
    throw fail("setup", t("Fill in an API key, or a user name and password, in the plugin's settings."));
  }
  host.storage.set("session", s);
  // For pictures the app fetches itself, through plugin.json's requestHeaders.
  host.storage.set("token", s.token);
  return (current = s);
}

const signature = (): string =>
  fnv([serverURL(), setting("apiKey"), setting("username"), host.setting("password")].join("\n"));

export const isSignedOut = (): boolean => host.storage.get<boolean>("signedOut") === true;

/** Who the plugin is on the server, signing in first if it has to. */
export async function session(): Promise<Session> {
  if (isSignedOut()) throw fail("signIn", t("Sign in to your server."));
  const sig = signature();
  if (current?.for === sig) return current;
  const kept = host.storage.get<Session>("session");
  if (kept?.for === sig) return (current = kept);
  connecting ??= connect(sig).finally(() => (connecting = undefined));
  return connecting;
}

/** Forgets the session, as when a setting changes: the next request makes it again. */
export function forget(): void {
  current = undefined;
  host.storage.remove("session");
  host.storage.remove("token");
}

export function signOut(): void {
  forget();
  host.storage.set("signedOut", true);
}

export function signedIn(): void {
  host.storage.remove("signedOut");
}

/** The server of the session in use: every address the plugin makes comes after one. */
export const server = (): string => current?.server ?? "";
export const userId = (): string => current?.userId ?? "";
export const token = (): string => current?.token ?? "";

export type Params = Record<string, string | number | boolean | undefined | null>;

export function query(params: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

interface Init {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
}

async function send(s: Session, path: string, params: Params, init: Init): Promise<Response> {
  const headers = authorization(s.userId, s.token);
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const filled: Params = {};
  for (const [k, v] of Object.entries(params)) filled[k] = v === "{user}" ? s.userId : v;
  const url = s.server + path.replaceAll("{user}", encodeURIComponent(s.userId)) + query(filled);
  return reach(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/**
 * A request as the user: `{user}` in the path, or as a parameter, is their ID. A password's token
 * that ran out signs in again once.
 */
export async function api<T>(path: string, params: Params = {}, init: Init = {}): Promise<T> {
  let s = await session();
  let res = await send(s, path, params, init);
  if (res.status === 401 && s.password) {
    forget();
    s = await session();
    res = await send(s, path, params, init);
  }
  if (res.status === 401) {
    forget();
    throw fail(
      "setup",
      s.password ? t("The server refused the user name or password.") : t("The server refused the API key."),
    );
  }
  if (res.status === 404) throw fail("unavailable", t("It's no longer on the server."));
  if (!res.ok) throw new Error(`${t("The server answered")} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Answers the text Emby sends, as for lyrics, or null when it can't. */
export async function text(path: string, params: Params = {}): Promise<string | null> {
  const s = await session();
  const res = await send(s, path, params, {});
  return res.ok ? res.text() : null;
}

/** The headers that let the app fetch the user's audio itself. */
export const audioHeaders = (): Record<string, string> => ({ authorization: `MediaBrowser Token="${token()}"` });
