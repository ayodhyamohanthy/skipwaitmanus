// The emailed six-digit code, as both goal sign-in forms run it (D-048-p3-signin).
// It mirrors the shared cores exactly - SeekerSignIn.tsx and ReferrerOtpSignIn.tsx:
// the same POST bodies (email trimmed and lower-cased, the code as six digits),
// the same "sent" / "signedIn" answers, the server's own error words with the same
// fallbacks, and the same device-remembered email. It knows no route: each form
// passes its own pair, so the referrer form can never reach WorkOS (D-030).
import { useState } from "react";
import { z } from "zod";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail, type SignInRole } from "@/lib/rememberedSignInEmail";

export type EmailCodeStage = "email" | "code";
export type EmailCodeRoutes = { readonly send: string; readonly verify: string };

export const CODE_LENGTH = 6;
export const SEND_FAILED = "We could not send the code. Try again shortly.";
export const VERIFY_FAILED = "That code could not be verified.";
export const EMAIL_NEEDED = "Enter your full email address.";
export const CODE_NEEDED = "Enter all six digits from the email.";
export const OFFLINE = "You are offline. Reconnect, then try again.";

// A shape check only, so an obvious typo never costs a send; the server stays the authority.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();
export const codeDigits = (value: string): string => value.replace(/\D/g, "").slice(0, CODE_LENGTH);

// Both routes answer { sent } / { signedIn } on success and { error } otherwise
// (server/_core/seekerEmailCode.ts, server/_core/otpLogin.ts); extra fields are ignored.
const AnswerSchema = z.object({
  sent: z.boolean().optional(),
  signedIn: z.boolean().optional(),
  error: z.string().optional(),
});
type Answer = z.infer<typeof AnswerSchema>;

async function postJson(path: string, body: Readonly<Record<string, string>>): Promise<{ ok: boolean; answer: Answer }> {
  const res = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const parsed = AnswerSchema.safeParse(await res.json().catch(() => ({})));
  return { ok: res.ok, answer: parsed.success ? parsed.data : {} };
}

export function useEmailCodeSignIn({ role, routes, onSignedIn }: { role: SignInRole; routes: EmailCodeRoutes; onSignedIn: () => void }) {
  const [stage, setStage] = useState<EmailCodeStage>("email");
  const [email, setEmailValue] = useState(() => rememberedSignInEmail(role));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail(role) !== "");
  const [code, setCodeValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setEmail = (value: string) => { setEmailValue(value); setError(""); };
  const setCode = (value: string) => { setCodeValue(codeDigits(value)); setError(""); };

  /** "Not you?": drop the remembered address from this device and start clean. */
  const forget = () => { forgetSignInEmail(role); setRemembered(false); setEmail(""); };

  /** Back to the email step, as the kit's "Use a different email" / "Change email". */
  const restart = () => { setStage("email"); setCodeValue(""); setError(""); };

  async function send(online: boolean) {
    if (busy) return;
    if (!EMAIL_SHAPE.test(email.trim())) { setError(EMAIL_NEEDED); return; }
    if (!online) { setError(OFFLINE); return; }
    setBusy(true); setError("");
    try {
      const { ok, answer } = await postJson(routes.send, { email: normalizeEmail(email) });
      if (!ok || !answer.sent) { setError(answer.error || SEND_FAILED); return; }
      setStage("code");
    } catch { setError(SEND_FAILED); } finally { setBusy(false); }
  }

  async function verify(online: boolean) {
    if (busy) return;
    if (code.length !== CODE_LENGTH) { setError(CODE_NEEDED); return; }
    if (!online) { setError(OFFLINE); return; }
    setBusy(true); setError("");
    try {
      const { ok, answer } = await postJson(routes.verify, { email: normalizeEmail(email), code });
      if (!ok || !answer.signedIn) { setError(answer.error || VERIFY_FAILED); return; }
      rememberSignInEmail(role, email);
      onSignedIn();
    } catch { setError(VERIFY_FAILED); } finally { setBusy(false); }
  }

  return { stage, email, setEmail, remembered, forget, code, setCode, busy, error, send, verify, restart, sentTo: normalizeEmail(email) };
}
