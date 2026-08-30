import type { CookieOptions, Request } from "express";

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
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
