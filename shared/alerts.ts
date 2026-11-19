/**
 * Saved job alerts (kit: /alerts Saved alerts tab). A seeker watches a
 * company; the first verified referrer there notifies every unpaused
 * watcher exactly once. The cap is the plan entitlement's savedAlerts
 * (shared/planEntitlements.ts): Free keeps 3, paid plans are unlimited.
 * Timestamps are JS-computed, never DB NOW().
 */

export const FREE_ALERT_LIMIT = 3;

export type SeekerAlert = {
  id: number;
  companyDomain: string;
  paused: boolean;
  notifiedAt: string | null;
  createdAt: string;
};

export function normalizeAlertDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

/** `cap` is the entitlement's savedAlerts; null means unlimited. */
export function canAddAlert(input: { existingCount: number; cap: number | null }): boolean {
  return input.cap === null || input.existingCount < input.cap;
}
