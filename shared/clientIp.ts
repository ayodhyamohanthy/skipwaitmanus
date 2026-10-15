/**
 * Edge-to-container client IP contract.
 *
 * The API container sits behind the Worker, and Express runs with
 * `trust proxy` so req.ip comes from X-Forwarded-For. A caller can send any
 * X-Forwarded-For they like, and Express takes the leftmost entry, so every
 * req.ip-keyed rate limiter could be rotated past with a spoofed header.
 *
 * The Worker is the only way into the container and Cloudflare sets
 * CF-Connecting-IP itself (a client-supplied value is overwritten at the
 * edge). Before forwarding, the Worker discards every client-supplied
 * forwarding header and writes a single X-Forwarded-For carrying the
 * CF-Connecting-IP. If that value is missing or not an IP, no forwarding
 * header is sent and the limiter falls back to the shared socket address
 * (one shared bucket: stricter, never bypassable).
 */
const CLIENT_SUPPLIED_FORWARDING_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded", "true-client-ip", "x-client-ip"];

// No node:net here: the Worker runs without nodejs_compat.
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
function isIp(v: string): boolean {
  if (IPV4.test(v)) return true;
  if (!/^[0-9a-fA-F:.]+$/.test(v) || !v.includes(":")) return false;
  try { return new URL(`http://[${v}]/`).hostname.length > 2; } catch { return false; }
}

function normalize(value: string): string {
  const v = value.trim();
  return v.startsWith("::ffff:") && IPV4.test(v.slice(7)) ? v.slice(7) : v;
}

export function withEdgeClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  const edgeIp = normalize(headers.get("cf-connecting-ip") ?? "");
  for (const name of CLIENT_SUPPLIED_FORWARDING_HEADERS) headers.delete(name);
  if (edgeIp && !edgeIp.includes(",") && isIp(edgeIp)) headers.set("x-forwarded-for", edgeIp);
  return new Request(request, { headers });
}
