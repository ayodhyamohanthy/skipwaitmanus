import { createHmac } from "node:crypto";

/**
 * D-077(5): the reference a person sees on an ask ("R-8F3K2" in the comps). `Ref-{1000+id}` revealed roughly how
 * many asks exist (D-059: no business numbers in public), so the code is five Crockford base32 characters of an
 * HMAC of the ask id. Display only: never parsed, looked up or used as an identifier in a URL or an API. Admin
 * screens keep `Ref-{1000+id}` (admins may see volume).
 *
 * The key derives from JWT_SECRET with its own prefix (the same in-repo pattern as server/workEmailKey.ts), so no
 * new secret is needed. Rotating JWT_SECRET changes every display reference, which is acceptable for display only.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function displayRefSecret(env: NodeJS.ProcessEnv = process.env): string {
  return `display-ref-jwt:${env.JWT_SECRET?.trim() || "skipwait-local-development-secret"}`;
}

export function displayRef(id: number, secret: string = displayRefSecret()): string {
  let bits = createHmac("sha256", secret).update(`referral:${id}`).digest().readUInt32BE(0) >>> 7;
  let code = "";
  for (let index = 0; index < 5; index++) {
    code = CROCKFORD[bits & 31] + code;
    bits >>>= 5;
  }
  return `R-${code}`;
}
