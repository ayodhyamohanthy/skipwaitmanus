import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { SeekerSignIn } from "@/components/SeekerSignIn";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { cn } from "@/lib/utils";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { GoalButton } from "@/components/goal/GoalButton";
import { usePasskeyAvailability } from "@/components/goal/GoalPasskeySignIn";

const credentialsSchema = z.object({ credentials: z.array(z.object({
  id: z.string(), deviceName: z.string().nullable(), createdAt: z.string().datetime(), lastUsedAt: z.string().datetime().nullable(),
}).strict()) }).strict();

function PasskeyManagementLink() {
  const availability = usePasskeyAvailability();
  return availability.enabled ? <Link href="/sign-in?passkeys=manage" className="inline-flex min-h-11 items-center text-g-meta underline underline-offset-2">Manage saved passkeys</Link> : null;
}

export function PasskeyManagement() {
  const [managementClient] = useState(() => new QueryClient());
  const availability = usePasskeyAvailability();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const credentials = useQuery({
    queryKey: ["managed-passkeys"],
    enabled: availability.enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const response = await fetch("/api/auth/passkey/list", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 403) throw new Error("Sign in with your seeker account to manage its passkeys. Referrers use work-email codes.");
      if (!response.ok) throw new Error("We could not load your passkeys. Check your connection and try again.");
      const parsed = credentialsSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("We could not load your passkeys. Please try again.");
      return parsed.data;
    },
  }, managementClient);

  async function revoke(credentialId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/passkey/revoke", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentialId }),
      });
      if (!response.ok || !z.object({ revoked: z.literal(true) }).safeParse(await response.json()).success) {
        setError("We could not confirm removal. Reload the list to check whether the passkey is still saved before trying again.");
        return;
      }
      setConfirmId(null); setNotice("Passkey removed. It can no longer sign in to SkipWait.");
      await credentials.refetch();
    } catch {
      setError("We could not confirm removal. Check your connection and reload the list before trying again.");
    } finally { setBusy(false); }
  }

  return <section className="g-scope" aria-labelledby="passkey-management-title">
    <h1 id="passkey-management-title" className="text-g-display">Manage your saved passkeys.</h1>
    <p className="mt-3 text-g-body text-g-ink-2">Remove a device you no longer use. Your email and social sign-in options remain available.</p>
    {availability.pending ? <p role="status" className="mt-6 text-g-meta">Checking passkey availability…</p> : !availability.enabled ? <p role="status" className="mt-6 text-g-meta">Passkey management is not available right now. Your other sign-in options still work.</p> : <>
      {credentials.isPending && <p role="status" className="mt-6 text-g-meta">Loading your passkeys…</p>}
      {credentials.isError && <div className="mt-6">
        <p role="alert" className="text-g-body">{credentials.error.message}</p>
        <Link className="mt-3 block text-g-label underline underline-offset-2" href="/sign-in?returnTo=%2Fsign-in%3Fpasskeys%3Dmanage">Sign in to manage passkeys</Link>
        <GoalButton className="mt-3" variant="outline" busy={credentials.isFetching} busyLabel="Loading…" onClick={() => { void credentials.refetch(); }}>Try again</GoalButton>
      </div>}
      {!credentials.isError && credentials.data && <>
        {credentials.data.credentials.length === 0 ? <p className="mt-6 text-g-body">You have no saved passkeys.</p> : <ul className="mt-6 divide-y divide-g-hairline border-y border-g-hairline">
          {credentials.data.credentials.map((credential, index) => {
            const name = credential.deviceName || `Saved passkey ${index + 1}`;
            return <li key={credential.id} className="py-5">
              <p className="break-words text-g-label">{name}</p>
              <p className="mt-1 text-g-meta text-g-ink-3">Added <time className="font-g-mono" dateTime={credential.createdAt}>{new Date(credential.createdAt).toLocaleDateString()}</time></p>
              <p className="text-g-meta text-g-ink-3">{credential.lastUsedAt ? <>Last used <time className="font-g-mono" dateTime={credential.lastUsedAt}>{new Date(credential.lastUsedAt).toLocaleDateString()}</time></> : "Not used to sign in yet"}</p>
              {confirmId === credential.id ? <div className="mt-3">
                <p className="text-g-meta">Remove this passkey? You will need another sign-in option on this device.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <GoalButton variant="primary" busy={busy} busyLabel="Removing…" onClick={() => { void revoke(credential.id); }}>Confirm removal</GoalButton>
                  <GoalButton disabledReason={busy ? "Removal in progress" : undefined} onClick={() => { setConfirmId(null); setError(""); }}>Cancel</GoalButton>
                </div>
              </div> : <GoalButton className="mt-3" variant="outline" aria-label={`Remove ${name}`} disabledReason={busy ? "Removal in progress" : undefined} onClick={() => { setConfirmId(credential.id); setError(""); setNotice(""); }}>Remove passkey</GoalButton>}
            </li>;
          })}
        </ul>}
      </>}
      {error && <div className="mt-4"><p role="alert" className="text-g-meta">{error}</p><GoalButton variant="outline" busy={credentials.isFetching} busyLabel="Reloading…" onClick={() => { setConfirmId(null); setError(""); void credentials.refetch(); }}>Reload passkeys</GoalButton></div>}
      {notice && <p role="status" className="mt-4 text-g-meta">{notice}</p>}
    </>}
    <Link href="/sign-in" className="mt-6 inline-flex min-h-11 items-center text-g-label underline underline-offset-2">Back to sign-in</Link>
  </section>;
}

type Intent = "seeker" | "referrer";

/** Same post-sign-in destinations as the kit sign-in. */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

const INTENT_COPY: Readonly<Record<Intent, { goal: string; sub: string; kicker: string }>> = {
  seeker: { kicker: "SIGN IN", goal: "Get referred.", sub: "Sign in to send your ask - or keep exploring first, no account needed." },
  // FOUNDER-LOCKED (Oct 16 2026): referrers sign in with a work-email OTP only.
  referrer: { kicker: "SIGN IN", goal: "Help the right person in.", sub: "Your work email verifies your company and stays private. You choose every ask." },
};

/** Goal-UI sign-in (doctrine: opens with the goal, one commit per step, ink on
 *  white, no kit colours). The functional cores stay shared: SeekerSignIn
 *  (social + email password) and ReferrerOtpSignIn (work-email OTP), restyled by
 *  their `goal` prop. Intent switch keeps both paths one tap away. */
export default function GoalSignIn() {
  const search = useSearch();
  const [intent, setIntent] = useState<Intent>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intent") === "referrer" ? "referrer" : "seeker"));
  const referrerReturnTo = typeof window !== "undefined" ? safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), INTENT_RETURN_TO.referrer) : INTENT_RETURN_TO.referrer;
  const requestedReturnTo = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("returnTo") : null;
  const seekerReturnTo = (ONE_TAP_PAY_SIGNIN || requestedReturnTo?.startsWith("/admin") || requestedReturnTo === "/sign-in?passkeys=manage") && typeof window !== "undefined" ? safeReturnTo(requestedReturnTo, INTENT_RETURN_TO.seeker) : INTENT_RETURN_TO.seeker;
  if (intent === "seeker" && new URLSearchParams(search).get("passkeys") === "manage") return <div data-skipwait-screen="passkey-management" className="g-scope min-h-screen bg-g-canvas px-5 py-12 font-g-sans text-g-ink"><main className="mx-auto max-w-[520px]"><PasskeyManagement /></main></div>;
  const copy = INTENT_COPY[intent];
  return (
    <div data-skipwait-screen="sign-in" className="min-h-screen bg-white font-g-sans text-g-ink">
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 gdesk:px-8">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center gap-2.5"><GoalBrandMark /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-g-small font-medium text-g-ink-2 hover:text-g-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[520px] px-5 py-12 gdesk:py-20">
        <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{copy.kicker}</p>
        <h1 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] gdesk:text-[56px]">{copy.goal}</h1>
        <p className="mt-4 text-g-body leading-[1.6] text-g-ink-2">{copy.sub}</p>
        <div className="mt-6"><BetaNoticeLine tone="goal" /></div>
        <div className="mt-8 grid grid-cols-2 gap-3" role="group" aria-label="I am here to">
          {([["seeker", "Find a referral", "I am looking for a job", Sparkles], ["referrer", "Give a referral", "I work at a company", ShieldCheck]] as const).map(([id, title, sub, Icon]) => (
            <button key={id} type="button" aria-pressed={intent === id} onClick={() => setIntent(id)} className={cn("relative rounded-[10px] border p-4 text-left transition-colors", intent === id ? "border-g-ink" : "border-g-hairline hover:border-g-control-edge")}>
              <Icon className="h-4 w-4 text-g-ink-2" aria-hidden="true" />
              <span className="mt-2 block text-g-small font-semibold">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-[1.5] text-g-ink-3">{sub}</span>
              {intent === id && <Check className="absolute right-3 top-3 h-4 w-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          {intent === "referrer"
            ? <div data-testid="referrer-work-email-otp"><ReferrerOtpSignIn onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
            : <SeekerSignIn returnTo={seekerReturnTo} goal />}
        </div>
        <p className="mt-5 text-[13px] leading-[1.6] text-g-ink-3">
          {intent === "referrer" ? "Work email only. We never use personal email or social logins for referrers." : "New to skipwait.me? Create an account with your email, then set a password from the emailed link."}
        </p>
        {intent === "seeker" && <PasskeyManagementLink />}
        <p className="mt-6 border-t border-g-hairline pt-5 text-[13px] leading-[1.6] text-g-ink-3">
          By continuing, you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-g-ink">Terms</Link> and acknowledge the <Link href="/privacy" className="underline underline-offset-2 hover:text-g-ink">Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.
        </p>
      </main>
    </div>
  );
}
