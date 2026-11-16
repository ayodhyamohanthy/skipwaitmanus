// D-093 "measure first": after sign-in, apply the account/local precedence
// (packet §4.8) and report the browser's primary language once per account per
// device. Signed out shows the device-local choice; signing in, a local choice
// is saved to the account only when the account has none — the default "en"
// with nothing stored is not a choice and is never written. The account's
// saved language always wins and the local copy is updated. The signup report
// carries only the primary subtag of the first browser language (the server
// maps it again) and is write-once under 24 h; it is never returned to the
// client. Fail-soft like DisplayPrefsSync: any error keeps the device defaults.
import { useEffect } from "react";
import { useAuth } from "@/_core/auth";
import { resolveDeviceLocale, type DeviceLocaleSource } from "./device";
import { setLanguage, LANGUAGE_STORAGE_KEY } from "./i18n";
import { isVisibleLanguage, type LanguageCode } from "../../../shared/languages";

const MARKER_PREFIX = "sw:signup-language-sent:";

function storedLocalChoice(): LanguageCode | null {
  try {
    const raw = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isVisibleLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function useLanguageSync() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const preferencesResponse = await fetch("/api/account/preferences", { credentials: "include", headers: authHeaders });
        if (!preferencesResponse.ok) return;
        const body = await preferencesResponse.json() as { preferences?: { language?: unknown } };
        const accountLanguage = isVisibleLanguage(body?.preferences?.language) ? body.preferences.language : null;
        const localChoice = storedLocalChoice();
        if (cancelled) return;
        if (accountLanguage) {
          // The account wins; the local copy is updated either way.
          setLanguage(accountLanguage, { persistLocal: true });
          try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, accountLanguage); } catch { /* storage unavailable */ }
        } else if (localChoice) {
          // Only an explicitly stored visible language is a choice to save;
          // the default "en" with nothing stored is not one (C4).
          try {
            await fetch("/api/account/preferences", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({ language: localChoice }),
            });
          } catch { /* PUT is best effort; the account keeps the next mount's chance */ }
        }
        // Once per account per device, report the browser primary language.
        const marker = `${MARKER_PREFIX}${userId}`;
        let alreadySent = false;
        try { alreadySent = Boolean(globalThis.localStorage?.getItem(marker)); } catch { alreadySent = true; }
        if (alreadySent) return;
        const deviceTag = resolveDeviceLocale(navigator as unknown as DeviceLocaleSource);
        const signupResponse = await fetch("/api/account/signup-language", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ language: deviceTag }),
        });
        if (signupResponse.ok) {
          try { globalThis.localStorage?.setItem(marker, "1"); } catch { /* storage unavailable */ }
        }
      } catch {
        // Keep the device defaults; the next mount tries again.
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, getToken]);
}
