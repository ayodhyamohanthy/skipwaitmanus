const JOB_SEEKER_TOKEN_RESET = "bridge-job-seeker-token-reset-3-free-v1";

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
