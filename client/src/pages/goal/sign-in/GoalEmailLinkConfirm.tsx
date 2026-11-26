// D-406: the page an emailed sign-in link opens. The email and code arrive in the URL fragment (never sent to the
// server, logs or a Referer header); the parent clears them from the address bar at once and this screen spends the code only
// when the person presses Sign in, so a mail scanner that opens the link spends nothing.
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { apiFetch } from "@/lib/apiFetch";
import { EMAIL_LINK_VERIFY_PATH, type EmailSignInLink } from "@shared/emailSignIn";

export const EMAIL_LINK_EXPIRED = "This sign-in link has expired or was already used. Send yourself a new one.";
const EMAIL_LINK_INVALID = "This sign-in link is invalid. Send yourself a new one.";

export function GoalEmailLinkConfirm({ link, returnTo, onRestart }: { link: EmailSignInLink | null; returnTo: string; onRestart: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(link ? "" : EMAIL_LINK_INVALID);

  async function signIn() {
    if (busy || !link) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(EMAIL_LINK_VERIFY_PATH[link.plane], {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: link.email, code: link.code }),
      });
      const body = await res.json().catch(() => ({})) as { signedIn?: boolean; error?: string };
      if (res.ok && body.signedIn) { window.location.assign(returnTo); return; }
      setError(res.status === 400 ? EMAIL_LINK_EXPIRED : body.error || EMAIL_LINK_EXPIRED);
    } catch {
      setError("We could not sign you in. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div data-testid="email-link-confirm" className="mt-4 grid gap-3">
      {link ? <>
        <p className="text-g-label text-g-ink">Sign in as <strong className="break-all">{link.email}</strong></p>
        <p className="text-g-meta text-g-ink-2">{link.plane === "r" ? "Your work email proves where you work. The link works once." : "The link from your email works once."}</p>
      </> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}
        </p>
      ) : null}
      {link ? <GoalButton type="button" variant="primary" className="w-full" busy={busy} busyLabel="Signing in…" onClick={() => { void signIn(); }}>Sign in</GoalButton> : null}
      <GoalButton type="button" variant={link ? "ghost" : "primary"} className="w-full" onClick={onRestart}>{error ? "Send a new link" : "Use a different email"}</GoalButton>
    </div>
  );
}
