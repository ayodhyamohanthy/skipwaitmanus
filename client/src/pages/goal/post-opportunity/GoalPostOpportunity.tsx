// Goal /post-opportunity (D-048-p3-post; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit wizard: one goal (share a useful company
// signal), one commit per step, identity always private. The route is not
// wrapped in AppShell, so this surface carries its own GoalAppShell frame.
// Data/API flow is the kit's: useReferrerAccess gates, POST /api/opportunities
// publishes, MyOpenings is reused read-only.
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, Clock3, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalAppShell, GoalButton, GoalErrorState, GoalField, GoalSkeletonRows, GoalTextInput } from "@/components/goal";
import MyOpenings from "@/components/opportunities/MyOpenings";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";
import { referrerSignInHref } from "@/lib/referrerSignIn";

type OpportunityMode = "hiring_now" | "walk_in";
function localInputToIso(value: string) { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

const inputClass = "h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-white px-3 text-g-body text-g-ink outline-none focus:border-g-ink";

function GoalPostOpportunityBody() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const [mode, setMode] = useState<OpportunityMode>("hiring_now");
  const [roleTitle, setRoleTitle] = useState("");
  const [targetRoleUrl, setTargetRoleUrl] = useState("");
  const [location, setLocation] = useState("");
  const [compensation, setCompensation] = useState("");
  const [walkInAt, setWalkInAt] = useState("");
  const [walkInEndsAt, setWalkInEndsAt] = useState("");
  const [step, setStep] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState<{ companyDomain: string; roleTitle: string } | null>(null);
  const [view, setView] = useState<"wizard" | "openings">("wizard");
  const [showPosterFirstName, setShowPosterFirstName] = useState(false);
  const access = useReferrerAccess();
  const totalSteps = mode === "walk_in" ? 3 : 2;
  const canProceed = step === 1 ? Boolean(roleTitle.trim()) : step === 2 ? mode === "hiring_now" || Boolean(walkInAt) : true;

  const publish = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canProceed || !isSignedIn) return;
    setPublishing(true); setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/opportunities", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ kind: mode, roleTitle, targetRoleUrl: targetRoleUrl || undefined, location: location || undefined, compensation: compensation.trim() || undefined, walkInAt: localInputToIso(walkInAt), walkInEndsAt: localInputToIso(walkInEndsAt), ...(showPosterFirstName ? { showPosterFirstName: true } : {}) }) });
      const payload = await readApiJson<{ opportunity?: { companyDomain: string; roleTitle: string }; error?: string }>(response, "We could not publish that opportunity");
      if (!response.ok || !payload.opportunity) throw new Error(payload.error || "We could not publish that opportunity");
      setPublished(payload.opportunity);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not publish that opportunity"); } finally { setPublishing(false); }
  };
  const continueFlow = () => { if (!canProceed) return; if (step < totalSteps) setStep(current => current + 1); else void publish(); };

  if (access.status === "checking") return <div data-skipwait-screen="post-opportunity-loading" className="px-5 py-6"><p className="mb-4 text-g-meta text-g-ink-3">Checking your company access…</p><GoalSkeletonRows density="company" count={3} /></div>;
  if (access.status === "error") return <div data-skipwait-screen="post-opportunity-access-error"><GoalErrorState title="We couldn’t check your company access" body={`${access.error.message || "Check your connection and try again."} Nothing changed on your account.`} retry={{ label: access.retrying ? "Trying again…" : "Try again", onClick: access.retry }} /></div>;
  if (access.status === "signed-out" || access.status === "unverified") {
    return (
      <div data-skipwait-screen="post-opportunity-access" className="max-w-[560px] px-5 py-8 max-gdesk:px-4">
        <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-g-hairline text-g-ink"><Lock className="h-5 w-5" aria-hidden="true" /></span>
        <div className="mt-5"><Kicker>YOUR NEXT STEP</Kicker></div>
        <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Verify your work email first.</h2>
        <p className="mt-3 text-g-body leading-[1.6] text-g-ink-2">Company opportunities are shared only by verified employees. Your name and work email remain private.</p>
        {/* Packet guardrail 2: the referrer sign-in is the canonical helper href, never a
            hand-written URL and never a seeker sign-in control. */}
        <div className="mt-6"><GoalButton variant="primary" asChild><Link href={referrerSignInHref("/post-opportunity")}>Verify work email</Link></GoalButton></div>
      </div>
    );
  }
  if (view === "openings") return <MyOpenings onBack={() => setView("wizard")} />;
  if (published) {
    return (
      <div data-skipwait-screen="opportunity-published" className="max-w-[560px] px-5 py-8 max-gdesk:px-4">
        <div role="status">
          <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink"><Check className="h-4 w-4" aria-hidden="true" />Live</p>
          <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Your opportunity is live.</h2>
          <p className="mt-3 text-g-body leading-[1.6] text-g-ink-2"><strong className="font-semibold text-g-ink">{published.roleTitle}</strong> is visible to job seekers at <strong className="font-semibold text-g-ink">{published.companyDomain}</strong>. {showPosterFirstName ? "Your first name is shown on the card. Your last name and work email never appear." : "Your identity is never shown."}</p>
          <div className="mt-6"><GoalButton variant="primary" onClick={() => go("/wall")}>View Opportunity Wall</GoalButton></div>
        </div>
      </div>
    );
  }

  return (
    <div data-skipwait-screen="post-opportunity" className="max-w-[640px] px-5 py-6 max-gdesk:px-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => (step > 1 ? setStep(current => current - 1) : go("/wall"))} className="inline-flex items-center gap-1.5 text-g-small font-medium text-g-ink-2 hover:text-g-ink"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Back</button>
        <button type="button" onClick={() => setView("openings")} className="text-g-small font-medium text-g-ink-2 hover:text-g-ink">Your openings</button>
      </div>
      <form onSubmit={event => { event.preventDefault(); continueFlow(); }} className="mt-6">
        <Kicker>{`STEP ${step} OF ${totalSteps} · VERIFIED COMPANY OPPORTUNITY`}</Kicker>
        {step === 1 ? (
          <>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Share one useful signal.</h2>
            <p className="mt-2 text-g-body leading-[1.6] text-g-ink-2">Just the useful company signal. You choose what appears on the card.</p>
            <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label="Opportunity kind">
              {([["hiring_now", "Hiring now", "A role open to referrals.", BadgeCheck], ["walk_in", "Walk-in", "A public event.", CalendarDays]] as const).map(([id, title, sub, Icon]) => (
                <button key={id} type="button" aria-label={title} aria-pressed={mode === id} onClick={() => { setMode(id); setStep(1); }} className={`rounded-[10px] border p-4 text-left transition-colors ${mode === id ? "border-g-ink" : "border-g-hairline hover:border-g-control-edge"}`}>
                  <Icon className="h-4 w-4 text-g-ink-2" aria-hidden="true" />
                  <span className="mt-2 block text-g-small font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.5] text-g-ink-3">{sub}</span>
                  {mode === id ? <Check className="mt-2 h-4 w-4" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
            <div className="mt-5"><GoalField label="Role or job title" htmlFor="goal-opp-role"><GoalTextInput id="goal-opp-role" required autoFocus value={roleTitle} onChange={event => setRoleTitle(event.target.value)} placeholder="e.g. Product Designer" /></GoalField></div>
          </>
        ) : step === 2 ? (
          <>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Add useful details.</h2>
            <p className="mt-2 text-g-body leading-[1.6] text-g-ink-2">A link and location help candidates act without exposing you.</p>
            <div className="mt-5 grid gap-4">
              <GoalField label={mode === "hiring_now" ? "Public job link" : "Public job link (optional)"} htmlFor="goal-opp-link" help={mode === "hiring_now" ? "Required for hiring-now posts. We check the link before publishing." : undefined}><GoalTextInput id="goal-opp-link" aria-label="Public job link" type="url" value={targetRoleUrl} onChange={event => setTargetRoleUrl(event.target.value)} placeholder="https://careers.company.com/role" /></GoalField>
              <GoalField label={mode === "walk_in" ? "Location" : "Location (optional)"} htmlFor="goal-opp-location" help={mode === "walk_in" ? "Required for walk-ins." : undefined}><GoalTextInput id="goal-opp-location" value={location} onChange={event => setLocation(event.target.value)} placeholder="e.g. Bengaluru or Remote" /></GoalField>
              <GoalField label="Compensation (optional)" htmlFor="goal-opp-comp" help="One line for the public pay range. Leave blank if you prefer not to share."><GoalTextInput id="goal-opp-comp" aria-label="Compensation" value={compensation} onChange={event => setCompensation(event.target.value.slice(0, 80))} placeholder="₹12–18 LPA or $80k–$110k" /></GoalField>
              <label className="flex items-start gap-3 rounded-[10px] border border-g-hairline p-4"><input type="checkbox" checked={showPosterFirstName} onChange={event => setShowPosterFirstName(event.target.checked)} className="mt-0.5 h-4 w-4 accent-g-ink" /><span><strong className="block text-g-label text-g-ink">Show my first name</strong><span className="mt-1 block text-g-meta leading-[1.5] text-g-ink-3">Candidates see just your first name on the card. Your last name and work email never appear.</span></span></label>
              {mode === "walk_in" ? <GoalField label="Starts at" htmlFor="goal-opp-start"><input id="goal-opp-start" aria-label="Starts at" required type="datetime-local" value={walkInAt} onChange={event => setWalkInAt(event.target.value)} className={inputClass} /></GoalField> : null}
            </div>
          </>
        ) : (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-g-hairline text-g-ink"><Clock3 className="h-5 w-5" aria-hidden="true" /></span>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Confirm the timing.</h2>
            <p className="mt-2 text-g-body leading-[1.6] text-g-ink-2">Share only public walk-in information.</p>
            <div className="mt-5"><GoalField label="Ends at" htmlFor="goal-opp-end" help="Required - the walk-in must have a valid start and end time."><input id="goal-opp-end" type="datetime-local" value={walkInEndsAt} onChange={event => setWalkInEndsAt(event.target.value)} className={inputClass} /></GoalField></div>
          </>
        )}
        <div className="mt-6 border-t border-g-hairline pt-4">
          <p className="mb-3 flex items-start gap-2 text-g-meta leading-[1.5] text-g-ink-3"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Your company is confirmed only when you publish. {showPosterFirstName ? "Your first name appears on the card. Your last name and work email never appear." : "Your name and work email never appear on the card."}</p>
          {error ? <p role="alert" className="mb-3 flex items-center gap-2 text-g-meta text-g-ink">{error}</p> : null}
          {step < totalSteps
            ? <GoalButton variant="primary" type="submit" disabledReason={canProceed ? undefined : "Add the required details first"}>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>
            : isSignedIn
              ? <GoalButton variant="primary" type="submit" busy={publishing} busyLabel="Publishing…" disabledReason={canProceed ? undefined : "Add the required details first"}>Publish privately<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>
              : <GoalButton variant="primary" type="button" asChild><Link href={referrerSignInHref("/post-opportunity")}>Use company email to publish</Link></GoalButton>}
        </div>
      </form>
    </div>
  );
}

export default function GoalPostOpportunity() {
  return (
    <GoalAppShell active="queue" pageTitle="Post an opportunity">
      <GoalPostOpportunityBody />
    </GoalAppShell>
  );
}
