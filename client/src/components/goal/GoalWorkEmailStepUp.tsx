// D-057-session-gate (D-245, packet §0b.6): the in-session work-email step-up.
// A signed-in referrer whose session needs a code confirms the work email they
// verified, in place, with goal primitives only. It never links to the
// standalone code sign-in (that would make another account): success
// re-checks the verdict and the surface opens for the same account.
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Mail } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/auth";
import type { CompanyAccess } from "@/components/referrer-home/referrerData";
import { referrerAccessKey } from "@/hooks/useReferrerAccess";
import { usePersistFn } from "@/hooks/usePersistFn";
import { confirmStepUpCode, sendStepUpCode } from "@/lib/referrerStepUpApi";
import { GoalButton } from "./GoalButton";
import { GoalField, GoalTextInput } from "./GoalField";

type Sent = { challengeId: string; email: string };

export function GoalWorkEmailStepUp({ access }: { access: CompanyAccess }) {
  const { userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const emailId = useId();
  const codeId = useId();
  const company = access.companyName || access.domain;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState<"" | "send" | "confirm">("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) { setError(`Enter your work email at ${access.domain}.`); return; }
    setBusy("send"); setError("");
    const result = await sendStepUpCode(address, fetchToken);
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    setSent({ challengeId: result.challengeId, email: address });
    setCode("");
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !sent) return;
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the six-digit code from your work email."); return; }
    setBusy("confirm"); setError("");
    const result = await confirmStepUpCode(sent.challengeId, code.trim(), fetchToken);
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    setConfirmed(true);
    // The verdict re-checks and the surface opens in place for this same account.
    await queryClient.invalidateQueries({ queryKey: referrerAccessKey(userId ?? null) });
  };

  return (
    <section data-skipwait-screen="referrer-step-up" aria-labelledby={`${emailId}-title`} className="g-scope mx-auto grid w-full max-w-[520px] gap-5 px-4 py-8 gdesk:py-12">
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-g-meta text-g-ink-3"><BadgeCheck aria-hidden="true" className="size-4" strokeWidth={1.75} />Verified at {company}</p>
        <h2 id={`${emailId}-title`} className="text-g-heading text-g-ink">Confirm you still work at {company} with a code to your work email.</h2>
        <p className="text-g-body text-g-ink-2">Your requests and history stay as they are. The code works for this sign-in only.</p>
      </div>
      {!sent ? (
        <form className="grid gap-4" onSubmit={send} noValidate>
          <GoalField label="Work email" htmlFor={emailId} hint={{ icon: Mail, text: `@${access.domain}`, tone: "muted" }} error={error || undefined}>
            <GoalTextInput id={emailId} type="email" inputMode="email" autoComplete="email" value={email} invalid={Boolean(error)} onChange={event => setEmail(event.target.value)} placeholder={`you@${access.domain}`} />
          </GoalField>
          <GoalButton type="submit" variant="primary" busy={busy === "send"} busyLabel="Sending code">Send code</GoalButton>
        </form>
      ) : (
        <form className="grid gap-4" onSubmit={confirm} noValidate>
          <p role="status" className="text-g-small text-g-ink-2">We sent a code to {sent.email}. It works once and expires in 10 minutes.</p>
          <GoalField label="Code" htmlFor={codeId} error={error || undefined}>
            <GoalTextInput id={codeId} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} invalid={Boolean(error)} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" />
          </GoalField>
          <div className="flex flex-wrap items-center gap-2">
            <GoalButton type="submit" variant="primary" busy={busy === "confirm"} busyLabel="Confirming" disabledReason={confirmed ? "Confirmed" : undefined}>Confirm</GoalButton>
            <GoalButton type="button" variant="ghost" onClick={() => { setSent(null); setError(""); }}>Use another address</GoalButton>
            <GoalButton type="button" variant="ghost" onClick={() => { void send(); }} disabledReason={busy ? "Sending" : undefined}>Send a new code</GoalButton>
          </div>
        </form>
      )}
    </section>
  );
}
