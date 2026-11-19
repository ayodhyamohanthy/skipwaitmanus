import { createHmac } from "node:crypto";

/**
 * Public ask reference (W1 queue comp: "R-8F3K2" style). Referrers quote this
 * instead of the sequential database id, which leaks volume and ordering.
 * Derived, never stored: HMAC-SHA256 over the id with a key derived from
 * JWT_SECRET (the in-repo pattern from workEmailKey.ts), so no new secret and
 * no owner action; rotating JWT_SECRET only changes how refs read, no data
 * depends on them. Alphabet drops I/L/O/U so a ref stays unambiguous read aloud.
 */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function askRefSecret(env: NodeJS.ProcessEnv = process.env): string {
  return `ask-ref:${env.JWT_SECRET?.trim() || "skipwait-local-development-secret"}`;
}

export function publicAskRef(id: number, env: NodeJS.ProcessEnv = process.env): string {
  const digest = createHmac("sha256", askRefSecret(env)).update(`ask:${id}`).digest();
  let out = "";
  for (let i = 0; i < 5; i += 1) out += REF_ALPHABET[digest[i] % 32];
  return `R-${out}`;
}
