import { useEffect, useState } from "react";
import type { SeekerSetup } from "@shared/seekerSetup";

const isUsableSetup = (value: unknown): value is SeekerSetup => {
  const v = value as Partial<SeekerSetup> | null;
  return Boolean(v) && typeof v?.city === "string" && typeof v.countries === "string" && typeof v.remote === "boolean" && typeof v.visa === "string";
};

/** The signed-in seeker's saved setup, or null while loading, signed out, or on any failure. Read-only. */
export function useSeekerSetup(signedIn: boolean, getToken: () => Promise<string | null>): SeekerSetup | null {
  const [setup, setSetup] = useState<SeekerSetup | null>(null);
  useEffect(() => {
    if (!signedIn) { setSetup(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/profile/setup", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) return;
        const payload = (await response.json()) as SeekerSetup;
        if (!cancelled && isUsableSetup(payload)) setSetup(payload);
      } catch { /* fit is advisory; no setup means no warning */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  return setup;
}
