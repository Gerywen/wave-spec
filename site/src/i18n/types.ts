export type Locale = "zh" | "en";

export type Msg = { zh: string; en: string };

export function tx(msg: Msg | string, locale: Locale): string {
  if (typeof msg === "string") return msg;
  return msg[locale];
}

export function L(zh: string, en: string): Msg {
  return { zh, en };
}

export const LOCALE_STORAGE_KEY = "apc-site-locale";

export function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const lang = typeof navigator !== "undefined" ? navigator.language : "zh";
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}
