import type { CookieOptions, Request } from "express";

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    // OAuth returns through a top-level GET, which SameSite=Lax permits. Lax
    // is also retained reliably by iOS Safari after a cross-site AuthKit flow.
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
