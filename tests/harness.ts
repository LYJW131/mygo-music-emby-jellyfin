// Loads the built plugin (dist/plugin/index.js) the way MyGo Music does, as a
// module that imports nothing, with a stand-in for its host global. Needs
// node --experimental-vm-modules.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, SourceTextModule } from "node:vm";

export const dist = join(import.meta.dirname, "../dist/plugin");

export interface Options {
  storage?: Map<string, unknown>;
  settings?: Record<string, string>;
  language?: "en" | "zh-CN";
}

// The plugin's exports, as the app calls them.
export type Plugin = Record<string, (...args: any[]) => any>;

export async function load({ storage = new Map(), settings = {}, language = "en" }: Options = {}) {
  const locale = JSON.parse(await readFile(join(dist, "locales/zh-CN.json"), "utf8")) as Record<string, string>;
  const host: Host = {
    platform: "linux",
    arch: "amd64",
    storage: {
      get: <T>(k: string) => (storage.has(k) ? (structuredClone(storage.get(k)) as T) : undefined),
      set: (k, v) => void storage.set(k, structuredClone(v)),
      remove: (k) => void storage.delete(k),
    },
    setting: (key) => settings[key] ?? "",
    t: (text) => (language === "zh-CN" ? (locale[text] ?? text) : text),
    language: () => language,
  };
  const source = await readFile(join(dist, "index.js"), "utf8");
  const mod = new SourceTextModule(source, {
    identifier: "index.js",
    context: createContext({
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      fetch,
      setTimeout,
      clearTimeout,
      console,
      host,
    }),
  });
  await mod.link(() => {
    throw new Error("a plugin imports nothing");
  });
  await mod.evaluate();
  // What a plugin answers reaches the app as JSON, out of the plugin's realm.
  const api: Plugin = {};
  for (const [name, fn] of Object.entries(mod.namespace as Plugin)) {
    api[name] = async (...args) => {
      const value = await fn(...args);
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    };
  }
  return { api, storage, settings };
}
