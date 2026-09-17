const JOB_SEEKER_TOKEN_RESET = "bridge-job-seeker-token-reset-3-free-v1";
const INCLUDED_FREE_TOKENS = 3;
export const TOKEN_ACTION_COST = 1;
export type TokenRole = "job_seeker" | "referrer";
export type TokenStorage = Pick<Storage, "getItem" | "setItem">;

/** Blocked or restricted storage must never take a rendering page down. */
function browserTokenStorage(): TokenStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function tokenReturnPath(role: TokenRole): string {
  return role === "referrer" ? "/referrer" : "/request";
}

export function addPurchasedTokens(currentBalance: number, purchaseCount: number): number {
  const current = Number.isFinite(currentBalance) ? Math.max(0, currentBalance) : 0;
  const purchased = Number.isFinite(purchaseCount) ? Math.max(0, Math.floor(purchaseCount)) : 0;
  return current + purchased;
}

export function canSpendToken(balance: number): boolean {
  return Number.isFinite(balance) && balance >= TOKEN_ACTION_COST;
}

export function spendToken(balance: number): number {
  return canSpendToken(balance) ? balance - TOKEN_ACTION_COST : Math.max(0, balance);
}

export function getJobSeekerTokens(storage: TokenStorage | null = browserTokenStorage()): number {
  if (!storage) return INCLUDED_FREE_TOKENS;
  try {
    if (storage.getItem(JOB_SEEKER_TOKEN_RESET) !== "complete") {
      storage.setItem("bridge-tokens", String(INCLUDED_FREE_TOKENS));
      storage.setItem(JOB_SEEKER_TOKEN_RESET, "complete");
    }
    const storedBalance = storage.getItem("bridge-tokens");
    if (storedBalance === null) {
      storage.setItem("bridge-tokens", String(INCLUDED_FREE_TOKENS));
      return INCLUDED_FREE_TOKENS;
    }
    const value = Number(storedBalance);
    return Number.isFinite(value) && value >= 0 ? value : INCLUDED_FREE_TOKENS;
  } catch {
    return INCLUDED_FREE_TOKENS;
  }
}

export function setJobSeekerTokens(value: number, storage: TokenStorage | null = browserTokenStorage()): void {
  if (!storage) return;
  const next = Number.isFinite(value) ? Math.max(0, value) : 0;
  try { storage.setItem("bridge-tokens", String(next)); } catch { /* persistence is best-effort */ }
}
