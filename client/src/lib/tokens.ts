const JOB_SEEKER_TOKEN_RESET = "bridge-job-seeker-token-reset-3-free-v1";
export const TOKEN_ACTION_COST = 1;
export type TokenRole = "job_seeker" | "referrer";

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

export function getJobSeekerTokens(): number {
  if (typeof window === "undefined") return 3;
  if (localStorage.getItem(JOB_SEEKER_TOKEN_RESET) !== "complete") {
    localStorage.setItem("bridge-tokens", "3");
    localStorage.setItem(JOB_SEEKER_TOKEN_RESET, "complete");
  }
  const value = Number(localStorage.getItem("bridge-tokens"));
  return Number.isFinite(value) && value >= 0 ? value : 3;
}

export function setJobSeekerTokens(value: number): void {
  localStorage.setItem("bridge-tokens", String(Math.max(0, value)));
}
