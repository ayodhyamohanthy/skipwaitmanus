/**
 * Typing a different email on the sign-in page must not silently sign in the previous account through a
 * still-live hosted AuthKit session. At sign-in the callback leaves a signed, httpOnly cookie linking this browser
 * to {WorkOS user id, hosted session id}. When a later sign-in types an email that belongs to a different WorkOS
 * user (or to nobody yet), the linked hosted session is revoked first, so the hosted page falls back to the normal
 * email-code step. Fail-soft everywhere: any error or timeout just continues with the plain redirect, and nothing
 * the caller sees depends on whether the typed email exists.
 */
import { SignJWT, jwtVerify } from "jose";

export const HOSTED_LINK_COOKIE = "sw_hosted";
export const HOSTED_LINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const AUDIENCE = "skipwait-hosted-link";
const SID = /^session_[A-Za-z0-9]+$/;
const UID = /^user_[A-Za-z0-9]+$/;

export type HostedLink = { uid: string; sid: string };

export async function signHostedLink(link: HostedLink, key: Uint8Array): Promise<string | null> {
  if (!UID.test(link.uid) || !SID.test(link.sid)) return null;
  return new SignJWT({ uid: link.uid, sid: link.sid }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(Math.floor((Date.now() + HOSTED_LINK_MAX_AGE_MS) / 1000)).sign(key);
}

export async function readHostedLink(cookie: string | undefined, key: Uint8Array): Promise<HostedLink | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, key, { algorithms: ["HS256"], audience: AUDIENCE });
    return typeof payload.uid === "string" && typeof payload.sid === "string" && UID.test(payload.uid) && SID.test(payload.sid) ? { uid: payload.uid, sid: payload.sid } : null;
  } catch { return null; }
}

export type AccountSwitchApi = {
  listUsers: (options: { email: string }) => Promise<{ data?: Array<{ id: string }> }>;
  revokeSession: (payload: { sessionId: string }) => Promise<unknown>;
};

/** True when the linked hosted session was revoked because the typed email is a different account. */
export async function revokeHostedSessionOnAccountSwitch(api: AccountSwitchApi | undefined, link: HostedLink | null, typedEmail: string, options: { timeoutMs?: number; log?: (message: string) => void } = {}): Promise<boolean> {
  if (!api || !link || !typedEmail) return false;
  const log = options.log ?? (() => {});
  const work = (async () => {
    const found = await api.listUsers({ email: typedEmail });
    const typedUserId = Array.isArray(found.data) ? found.data[0]?.id : undefined;
    if (typedUserId === link.uid) return false;
    await api.revokeSession({ sessionId: link.sid });
    return true;
  })().catch(() => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => { log("hosted account-switch revoke timed out"); resolve(false); }, options.timeoutMs ?? 3000); });
  try { return await Promise.race([work, timeout]); } finally { if (timer) clearTimeout(timer); }
}

/**
 * An explicit "Continue to sign in" click on /sign-in must show the AuthKit box, not silently reuse a hosted
 * session left in this browser (founder report Oct 16 2026: Sign in went straight to /explore). Revokes the linked
 * hosted session, fail-soft. True when a session was revoked.
 */
export async function revokeLinkedHostedSession(api: Pick<AccountSwitchApi, "revokeSession"> | undefined, link: HostedLink | null, options: { timeoutMs?: number; log?: (message: string) => void } = {}): Promise<boolean> {
  if (!api || !link) return false;
  const work = api.revokeSession({ sessionId: link.sid }).then(() => true).catch(() => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => { (options.log ?? (() => {}))("hosted fresh sign-in revoke timed out"); resolve(false); }, options.timeoutMs ?? 3000); });
  try { return await Promise.race([work, timeout]); } finally { if (timer) clearTimeout(timer); }
}
