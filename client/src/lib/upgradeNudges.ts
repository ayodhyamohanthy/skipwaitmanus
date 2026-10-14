// UPGRADE_NUDGES.md frequency rules on this device: a nudge shows at most once
// per session per trigger, and "I'll wait" / "Dismiss" hides it for 7 days.
// Keys are per signed-in account. Storage can be blocked (private mode, site
// data cleared), so every access is guarded and a failure only means the nudge
// may show again; the reason a send failed is always shown regardless.
export const NUDGE_TRIGGERS = ["slot_cap"] as const;
export type NudgeTrigger = (typeof NUDGE_TRIGGERS)[number];

export const NUDGE_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

const key = (trigger: NudgeTrigger, account: string) => `skipwait-nudge:${trigger}:${account}`;

function store(kind: "local" | "session"): Storage | null {
  try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

function read(kind: "local" | "session", name: string): string | null {
  try { return store(kind)?.getItem(name) ?? null; } catch { return null; }
}

function write(kind: "local" | "session", name: string, value: string) {
  try { store(kind)?.setItem(name, value); } catch { /* the nudge may show again; nothing else depends on it */ }
}

/** True when this trigger has not shown this session and was not dismissed in the last 7 days. */
export function canShowNudge(trigger: NudgeTrigger, account: string, nowMs: number = Date.now()): boolean {
  if (read("session", key(trigger, account))) return false;
  const until = Number(read("local", key(trigger, account)));
  return !(Number.isFinite(until) && until > nowMs);
}

export function markNudgeShown(trigger: NudgeTrigger, account: string) {
  write("session", key(trigger, account), "shown");
}

export function dismissNudge(trigger: NudgeTrigger, account: string, nowMs: number = Date.now()) {
  write("local", key(trigger, account), String(nowMs + NUDGE_DISMISS_MS));
}
