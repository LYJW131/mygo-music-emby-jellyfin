// The host object MyGo Music gives a plugin, as far as this plugin uses it.
// See internal/plugin/host.go in MyGo Music.

export {};

declare global {
  const host: Host;

  /** plugin.json's version, put in by scripts/build.ts. */
  const PLUGIN_VERSION: string | undefined;

  interface Host {
    platform: string;
    arch: string;
    storage: {
      get<T = unknown>(key: string): T | undefined;
      set(key: string, value: unknown): void;
      remove(key: string): void;
    };
    /** The listener's language, `en` or `zh-CN`. */
    language(): string;
    /** The text in the listener's language, from the plugin's locales. */
    t(text: string): string;
    setting(key: string): string;
  }
}
