import type { Request } from "express";
import { isIP } from "node:net";

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4) return trimmed.slice(7);
  return trimmed;
}

export function resolveTrustedClientIp(req: Request): string {
  // This switch is safe only after Cloudflare overwrites CF-Connecting-IP and
  // the origin firewall accepts traffic from Cloudflare exclusively.
  if (process.env.TRUST_CLOUDFLARE_CONNECTING_IP === "true") {
    const cf = normalizeIp(req.header("cf-connecting-ip") ?? "");
    if (cf && !cf.includes(",") && isIP(cf)) return cf;
  }
  const remote = normalizeIp(req.socket.remoteAddress ?? "");
  return isIP(remote) ? remote : "unknown";
}
