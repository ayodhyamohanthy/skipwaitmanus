import type { CookieOptions, Request } from "express";

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  // Express derives req.protocol from the FIRST X-Forwarded-Proto entry, so read the
  // first here too. `.some()` treated a header like "http, https" (a hop that
  // appends rather than replaces) as secure, which emitted the session cookie with
  // Secure + SameSite=None over plain http — browsers then reject it, so the user
  // was silently never signed in and logout could not clear the stale cookie.
  return protoList[0]?.trim().toLowerCase() === "https";
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    // Browsers reject SameSite=None unless the cookie is also Secure, which
    // plain-http development cannot satisfy. Falling back to Lax there keeps
    // the session cookie alive locally. This belongs here rather than in each
    // caller so every auth path (OAuth, WorkOS, dev) behaves the same.
    sameSite: secure ? ("none" as const) : ("lax" as const),
    secure,
  };
}
