// D-406 (owner, Nov 25 2026): anyone signs in by entering an email and getting one SkipWait email with a
// six-digit code and a one-click link. The link carries the email and code in the URL fragment, which never
// reaches the server, logs or a Referer header; /sign-in reads it and spends the code only on a button click,
// so a mail scanner that opens the link spends nothing. Packet: docs/plans/AUTH-email-link-code.md.
import { z } from "zod";

/** AUTH-email-link-release switch (D-223). Server and client read this one value. */
export const EMAIL_SIGN_IN_LINK_ENABLED = true;

/** Which verify endpoint the link finishes on: "s" seeker email code, "r" referrer work-email code. */
export type EmailLinkPlane = "s" | "r";

export type EmailSignInLink = { readonly email: string; readonly code: string; readonly plane: EmailLinkPlane };

/** The fragment marker that tells /sign-in this is an emailed link. */
export const EMAIL_LINK_MARKER = "email-link";

export const EMAIL_LINK_VERIFY_PATH: Readonly<Record<EmailLinkPlane, string>> = {
  s: "/api/auth/workos/email-code/verify",
  r: "/api/auth/otp/verify",
};

const linkSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/),
  code: z.string().regex(/^\d{6}$/),
  plane: z.enum(["s", "r"]),
}).strict();

/** The link put in the email: `<origin>/sign-in#email-link&e=<email>&c=<code>&p=<plane>`. */
export function emailSignInLink(origin: string, link: EmailSignInLink): string {
  const parsed = linkSchema.parse({ email: link.email, code: link.code, plane: link.plane });
  const params = new URLSearchParams({ e: parsed.email, c: parsed.code, p: parsed.plane });
  return `${origin.replace(/\/+$/, "")}/sign-in#${EMAIL_LINK_MARKER}&${params.toString()}`;
}

/** Reads a `location.hash`; null unless it is a well-formed emailed link. */
export function parseEmailSignInHash(hash: string): EmailSignInLink | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body !== EMAIL_LINK_MARKER && !body.startsWith(`${EMAIL_LINK_MARKER}&`)) return null;
  const params = new URLSearchParams(body.slice(EMAIL_LINK_MARKER.length + 1));
  const result = linkSchema.safeParse({ email: params.get("e") ?? "", code: params.get("c") ?? "", plane: params.get("p") ?? "" });
  return result.success ? result.data : null;
}
