// Loads the signed-in person's saved time zone and date format into the display store. Fail-soft: on any error the
// device defaults (or the guest's local choice) stay in effect.
import { useEffect } from "react";
import { useAuth } from "@/_core/auth";
import { setDisplayPrefs, validZone } from "@/lib/displayPrefs";

export function DisplayPrefsSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/account/preferences", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) return;
        const body = await response.json() as { preferences?: { timeZone?: unknown; dateFormat?: unknown } };
        const zone = typeof body.preferences?.timeZone === "string" && validZone(body.preferences.timeZone) ? body.preferences.timeZone : null;
        const format = body.preferences?.dateFormat;
        if (!cancelled) setDisplayPrefs({ timeZone: zone, dateFormat: format === "dmy" || format === "mdy" || format === "iso" ? format : null });
      } catch { /* keep device defaults */ }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);
  return null;
}
