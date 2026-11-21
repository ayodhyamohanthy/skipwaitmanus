// Canonical Worker activation proof. The existing JWT secret signs a distinct
// message; public callers can neither choose the activation time nor replay a
// different release. No new secret or environment setting is required.
export const SEEKER_PASSWORD_RELEASE_HEADER = "x-skipwait-password-release";
export const SEEKER_CODE_GRACE_MS = 24 * 60 * 60_000;
const SHA = /^[a-f0-9]{40}$/;
const encoder = new TextEncoder();

async function signature(secret: string, sha: string, at: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`seeker-password-release:${sha}:${at}`)));
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export async function withSeekerPasswordRelease(request: Request, secret: string, sha: string, now: number): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete(SEEKER_PASSWORD_RELEASE_HEADER);
  if (secret && SHA.test(sha) && Number.isSafeInteger(now) && now > 0) {
    headers.set(SEEKER_PASSWORD_RELEASE_HEADER, `${sha}.${now}.${await signature(secret, sha, now)}`);
  }
  return new Request(request, { headers });
}
