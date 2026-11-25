// D-093 "measure first": the client language store. Signed out, the choice is
// the device-local value (localStorage "sw:language") and only English is
// visible today; signing in, the account's saved language wins and the local
// copy is updated (packet §4.8). Only a language marked reviewed in
// shared/languages.ts is ever stored, rendered or synced — an unreviewed code
// in storage is ignored. Formatting (dates, numbers, currency) stays on the
// device locale (device.ts unchanged, packet §4.9).
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isVisibleLanguage, LANGUAGES, type LanguageCode } from "../../../shared/languages";
import { translate, type TranslateParams } from "../../../shared/i18n/catalog";

export const LANGUAGE_STORAGE_KEY = "sw:language";

function readLocal(): LanguageCode {
  try {
    const raw = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isVisibleLanguage(raw) ? raw : "en";
  } catch {
    return "en";
  }
}

function isVisible(code: unknown): code is LanguageCode {
  return isVisibleLanguage(code);
}

let current: LanguageCode = readLocal();
const listeners = new Set<() => void>();

export function getLanguage(): LanguageCode {
  return current;
}

export function setLanguage(code: LanguageCode, { persistLocal = true }: { persistLocal?: boolean } = {}) {
  if (!isVisible(code) || code === current) {
    if (isVisible(code) && persistLocal) {
      try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* storage unavailable: keep in memory */ }
    }
    return;
  }
  current = code;
  if (persistLocal) {
    try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* storage unavailable: keep in memory */ }
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLanguage(): LanguageCode {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

const dirOf = (code: LanguageCode) => LANGUAGES.find(entry => entry.code === code)?.dir ?? "ltr";

/** The active catalogue language, and a `t()` bound to it. */
export function useT() {
  const code = useLanguage();
  useEffect(() => {
    document.documentElement.lang = code;
    document.documentElement.dir = dirOf(code);
  }, [code]);
  return useCallback((keyPath: string, params?: TranslateParams, count?: number) => translate(code, keyPath, params, count).text, [code]);
}
