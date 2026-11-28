// MOBILE-both-prompt (D-414 (2), packet docs/plans/MOBILE-app-flow.md): "Where do you work now?", once per person,
// right after their first referral request is sent, behind BOTH_ROLES_PROMPT (off). The composer mounts
// BothRolesPrompt in its sent state only; the server decides whether it shows (shared/bothRolesPrompt.ts).
//
// The verification is the existing in-portal work-email code (D-057), the same three calls /verify makes
// (verifyApi): send a code to the work email, check it for a single-use enrollment receipt, then redeem the receipt
// on this signed-in account. It never creates a second account, never uses the standalone referrer code login
// (/api/auth/otp/*) and never accepts a personal inbox (the shared consumer-domain rule; the server checks again).
//
// A bottom sheet over a scrim, on a layer above the phone ask drawer (z-50) and the cookie bar (z-60). It does not
// grab the keyboard on open: focus lands on the sheet itself; Escape, the scrim and "Not now" close it.
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { GoalButton, GoalField, GoalFieldError, GoalTextInput, useOnlineStatus } from "@/components/goal";
import { checkWorkEmailCode, enrollWorkEmail, NETWORK_MESSAGE, sendWorkEmailCode, VerifyRequestError, type TokenSource } from "@/components/verify/verifyApi";
import { referrerAccessKey } from "@/hooks/useReferrerAccess";
import { trackClarityEvent } from "@/lib/clarity";
import {
  BOTH_ROLES_CODE_COPY, BOTH_ROLES_COPY, BOTH_ROLES_DONE_COPY, BOTH_ROLES_ERRORS, BOTH_ROLES_EVENTS, BOTH_ROLES_PROMPT_PATH,
  bothRolesPromptResponseSchema,
} from "@shared/bothRolesPrompt";
import { isCorporateEmailDomain } from "@shared/const";

/** The server's answer for the request just sent. Any failure reads as "do not show": the sheet is never an error. */
export async function fetchBothRolesPrompt(requestId: number, getToken: TokenSource): Promise<boolean> {
  try {
    const token = await getToken();
    const response = await fetch(`${BOTH_ROLES_PROMPT_PATH}?requestId=${requestId}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return false;
    const parsed = bothRolesPromptResponseSchema.safeParse(await response.json());
    return parsed.success && parsed.data.show;
  } catch {
    return false;
  }
}

type Close = "dismissed" | "verified";

/** Mounted by the composer in its sent state; asks the server once, opens the sheet at most once. */
export function BothRolesPrompt({ requestId, fetchToken, onSettled }: { requestId: number; fetchToken: TokenSource; onSettled(): void }) {
  const answer = useQuery({ queryKey: ["both-roles-prompt", requestId], queryFn: () => fetchBothRolesPrompt(requestId, fetchToken), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  const show = answer.data === true;
  useEffect(() => {
    if (answer.data === true) trackClarityEvent(BOTH_ROLES_EVENTS.shown);
    if (answer.data === false) onSettled();
    // onSettled is the composer's setter wrapper; the answer arrives once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer.data]);
  const close = (how: Close) => {
    if (how === "dismissed") trackClarityEvent(BOTH_ROLES_EVENTS.dismissed);
    onSettled();
  };
  return show ? <BothRolesSheet open onClose={close} fetchToken={fetchToken} /> : null;
}

type Step = "email" | "code" | "done";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof VerifyRequestError && reason.status === 0 ? NETWORK_MESSAGE : reason instanceof Error && reason.message ? reason.message : fallback);

export function BothRolesSheet({ open, onClose, fetchToken }: { open: boolean; onClose(how: Close): void; fetchToken: TokenSource }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // A correct code yields a single-use receipt, kept in memory only: a failed redeem retries without a new code.
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"sending" | "checking" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@") + 1);

  // The code field takes focus as it mounts (autoFocus); the verified state focuses its one action.
  useEffect(() => { if (step === "done") doneRef.current?.focus(); }, [step]);

  const sendCode = async () => {
    if (busy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(address)) { setError(BOTH_ROLES_ERRORS.email); return; }
    if (!isCorporateEmailDomain(domain)) { setError(BOTH_ROLES_ERRORS.personal); return; }
    setBusy("sending"); setError("");
    try {
      await sendWorkEmailCode(address, fetchToken);
      if (step === "email") trackClarityEvent(BOTH_ROLES_EVENTS.verifyStarted);
      setCode(""); setReceipt(""); setStep("code");
    } catch (reason) { setError(messageOf(reason, "We could not send the code. Try again shortly.")); }
    finally { setBusy(null); }
  };

  const confirm = async () => {
    if (busy) return;
    const digits = code.replace(/\D/g, "");
    if (!receipt && digits.length !== 6) { setError(BOTH_ROLES_ERRORS.code); return; }
    setBusy("checking"); setError("");
    try {
      let proof = receipt;
      if (!proof) {
        try { proof = await checkWorkEmailCode(address, digits, fetchToken); }
        catch (reason) {
          setError(reason instanceof VerifyRequestError && reason.status === 429 ? BOTH_ROLES_ERRORS.locked : messageOf(reason, "We could not check the code. Try again."));
          return;
        }
        setReceipt(proof);
      }
      try { await enrollWorkEmail(address, proof, fetchToken); }
      catch (reason) {
        // A refused receipt is spent or expired: the next try needs a new code.
        if (reason instanceof VerifyRequestError && reason.status === 403) { setReceipt(""); setCode(""); }
        setError(messageOf(reason, "We could not confirm this work email. Try again."));
        return;
      }
      trackClarityEvent(BOTH_ROLES_EVENTS.verified);
      // The shell's Queue tab reads the server's verdict; re-check it now (existing behaviour, D-057).
      void queryClient.invalidateQueries({ queryKey: referrerAccessKey(null).slice(0, 1) });
      setStep("done");
    } finally { setBusy(null); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void (step === "email" ? sendCode() : confirm()); };
  const offline = online ? undefined : "Reconnect to continue.";

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(step === "done" ? "verified" : "dismissed"); }} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-[60] bg-g-scrim data-[state=closed]:animate-g-fade-out motion-reduce:animate-none" />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          data-testid="both-roles-sheet"
          onOpenAutoFocus={event => { event.preventDefault(); contentRef.current?.focus(); }}
          className="g-scope animate-g-sheet-in fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[100dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[12px] bg-g-surface px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] font-g-sans text-g-ink outline-none data-[state=closed]:animate-g-sheet-out motion-reduce:animate-none gdesk:px-6"
        >
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-8 rounded-[2px] bg-g-control-edge" />
          {step === "done" ? (
            <>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-g-tile border border-g-hairline"><BadgeCheck className="size-5 text-g-ink" strokeWidth={1.75} /></span>
                <Dialog.Title className="text-g-heading text-g-ink">{BOTH_ROLES_DONE_COPY.title(domain)}</Dialog.Title>
              </div>
              <Dialog.Description className="mt-3 text-pretty text-g-body text-g-ink-2">{BOTH_ROLES_DONE_COPY.body}</Dialog.Description>
              <div className="mt-5 grid">
                <GoalButton ref={doneRef} variant="primary" touch="large" onClick={() => onClose("verified")}>{BOTH_ROLES_DONE_COPY.done}</GoalButton>
              </div>
            </>
          ) : (
            <form noValidate onSubmit={submit}>
              <Dialog.Title className="text-g-heading text-g-ink">{step === "email" ? BOTH_ROLES_COPY.title : BOTH_ROLES_CODE_COPY.title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-pretty text-g-body text-g-ink-2">{step === "email" ? BOTH_ROLES_COPY.body : BOTH_ROLES_CODE_COPY.sentTo(address)}</Dialog.Description>
              {step === "email" ? (
                <p className="mt-3 flex items-start gap-2 text-pretty text-g-meta text-g-ink-2"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{BOTH_ROLES_COPY.privacy}</p>
              ) : null}
              <div className="mt-4">
                {step === "email" ? (
                  <GoalField label={BOTH_ROLES_COPY.emailLabel} htmlFor="both-roles-email">
                    <GoalTextInput id="both-roles-email" describedBy={error ? "both-roles-error" : undefined} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" placeholder="you@company.com" value={email} invalid={Boolean(error)} onChange={event => { setEmail(event.target.value); setError(""); }} />
                  </GoalField>
                ) : (
                  <GoalField label={BOTH_ROLES_CODE_COPY.label} htmlFor="both-roles-code">
                    <GoalTextInput id="both-roles-code" describedBy={error ? "both-roles-error" : undefined} autoFocus inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" maxLength={6} value={code} disabled={Boolean(receipt)} invalid={Boolean(error)} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} />
                  </GoalField>
                )}
                {error ? <div className="mt-2"><GoalFieldError id="both-roles-error" role="alert">{error}</GoalFieldError></div> : null}
              </div>
              <div className="mt-5 grid gap-2">
                <GoalButton type="submit" variant="primary" touch="large" busy={busy !== null} busyLabel={busy === "sending" ? "Sending the code…" : "Checking…"} disabledReason={offline}>
                  {step === "email" ? BOTH_ROLES_COPY.verify : BOTH_ROLES_CODE_COPY.confirm}
                </GoalButton>
                {step === "email" ? (
                  <GoalButton variant="ghost" touch="large" onClick={() => onClose("dismissed")}>{BOTH_ROLES_COPY.notNow}</GoalButton>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <GoalButton variant="ghost" flush onClick={() => { setStep("email"); setCode(""); setReceipt(""); setError(""); }}>{BOTH_ROLES_CODE_COPY.changeEmail}</GoalButton>
                    <GoalButton variant="ghost" disabledReason={busy ? undefined : offline} onClick={() => { void sendCode(); }}>{BOTH_ROLES_CODE_COPY.resend}</GoalButton>
                  </div>
                )}
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
