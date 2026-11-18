// D-174-worldwide-discovery.company-context: a discovered-company pick on /explore
// reaches /ask as DISPLAYED CONTEXT ONLY ({name, domain}). One localStorage key, TTL
// mirroring ASK_PREFILL_TTL_MS, consumed on use, cleared on sign-out (the key is in
// referralLocalStorageKeys in client/src/lib/logoutPrivacy.ts). It never binds a company,
// never fills the link box, and changes nothing about Send, price, validation or
// eligibility: the company is not in the directory, so the seeker still pastes a real
// job link.
import { z } from "zod";
import { ASK_PREFILL_TTL_MS } from "@/lib/askPrefill";

export const DISCOVERY_HANDOFF_KEY = "skipwait:discovery-handoff";

const discoveryHandoffSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(253),
  at: z.number().finite(),
});

export type DiscoveryHandoff = z.infer<typeof discoveryHandoffSchema>;

/** The confirmation card calls this as it navigates to /ask. */
export function saveDiscoveryHandoff(pick: { name: string; domain: string }, now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCOVERY_HANDOFF_KEY, JSON.stringify({ name: pick.name, domain: pick.domain, at: now }));
  } catch {
    // A private-mode storage refusal must not break the navigation itself.
  }
}

/** A fresh pick, or null when absent, malformed, or older than the shared prefill TTL. */
export function readDiscoveryHandoff(now: number = Date.now()): DiscoveryHandoff | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DISCOVERY_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = discoveryHandoffSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return now - parsed.data.at <= ASK_PREFILL_TTL_MS ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Consumed-on-use and sign-out clearing both go through here. */
export function clearDiscoveryHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISCOVERY_HANDOFF_KEY);
  } catch {
    // Best-effort, like the rest of the privacy cleanup.
  }
}
