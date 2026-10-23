// Goal /email-review/:linkToken (D-048-p3-email-review; packet
// docs/plans/D-048-referrer.md). Goal-first rebuild of the kit review-action
// card: one decision, recorded only on an explicit press. Standalone frame
// (the route is not wrapped in AppShell), ink-on-white, one primary commit.
// Fetch/decision flow is the kit's, unchanged.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { Check, Lock, X } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { GoalButton } from "@/components/goal";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { WorkEmailSignIn } from "@/components/WorkEmailSignIn";
import { readApiJson } from "@/lib/apiResponse";

type Decision = "approved" | "declined";
type DeclineReason = "role_not_a_fit" | "cannot_support" | "timing";

function GoalFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-white p-5 font-g-sans text-g-ink">
      <section className="w-full max-w-[560px] rounded-[10px] border border-g-hairline bg-white p-6 gdesk:p-8">
        <GoalBrandMark />
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

export default function GoalEmailReviewAction() {
  const [, params] = useRoute("/email-review/:linkToken");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [state, setState] = useState<"loading" | "review" | "approved" | "passed" | "error">("loading");
  const [error, setError] = useState("");
  const [ethicsConfirmed, setEthicsConfirmed] = useState(false);

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !params?.linkToken) return;
    let active = true;
    void (async () => {
      try {
        const token = await getTokenRef.current();
        const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ review?: { ready?: boolean }; error?: string }>(response, "This private review link is unavailable");
        if (!response.ok || !payload.review?.ready) throw new Error(payload.error || "This private review link is unavailable");
        if (active) setState("review");
      } catch (reason) { if (active) { setError(reason instanceof Error ? reason.message : "This private review link is unavailable"); setState("error"); } }
    })();
    return () => { active = false; };
  }, [isSignedIn, params?.linkToken]);

  const decide = async (decision: Decision, declineReason?: DeclineReason) => {
    setState("loading");
    try {
      const token = await getTokenRef.current();
      const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params!.linkToken)}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ decision, ...(decision === "approved" ? { ethicsConfirmed: true } : {}), ...(declineReason ? { declineReason } : {}) }) });
      const payload = await readApiJson<{ status?: string; error?: string }>(response, "This private review link is unavailable");
      if (!response.ok || !payload.status) throw new Error(payload.error || "This private review link is unavailable");
      setState(payload.status === "approved" ? "approved" : "passed");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This private review link is unavailable"); setState("error"); }
  };

  if (!params?.linkToken) return <GoalFrame><h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Review link unavailable</h1></GoalFrame>;
  if (!isSignedIn) {
    return (
      <GoalFrame>
        <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-g-hairline"><Lock className="h-5 w-5" aria-hidden="true" /></span>
        <p className="mt-5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">PRIVATE REVIEW</p>
        <h1 className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Use your company email.</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Sign in with the verified work email that received this notification.</p>
        <div className="mt-5"><WorkEmailSignIn compact /></div>
      </GoalFrame>
    );
  }
  if (state === "loading") return <GoalFrame><h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Opening private review…</h1><p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">No decision is recorded until you press a confirmation button.</p></GoalFrame>;
  if (state === "error") return <GoalFrame><h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Review link unavailable</h1><p role="alert" className="mt-2 flex items-center gap-2 text-g-small text-g-crimson"><X className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p></GoalFrame>;
  if (state === "review") {
    return (
      <GoalFrame>
        <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">PRIVATE REVIEW</p>
        <h1 className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Choose your decision.</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Each button records the named action immediately.</p>
        <p className="mt-4 rounded-[10px] border border-g-hairline p-4 text-g-small leading-[1.6] text-g-ink-2">Accepting shares names both ways and the job seeker’s resume. Referring comes later, through your company’s own process.</p>
        <label className="mt-4 flex items-start gap-3 text-g-small text-g-ink"><input type="checkbox" checked={ethicsConfirmed} onChange={event => setEthicsConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-g-ink" />I’ll refer only through my company’s official process and won’t accept anything in return.</label>
        <div className="mt-5"><GoalButton variant="primary" disabledReason={ethicsConfirmed ? undefined : "Confirm the referral ethics line first"} onClick={() => void decide("approved")}>Accept &amp; connect</GoalButton></div>
        <div className="mt-3 grid gap-2">
          <GoalButton variant="outline" onClick={() => void decide("declined", "role_not_a_fit")}>Decline - role not a fit</GoalButton>
          <GoalButton variant="outline" onClick={() => void decide("declined", "cannot_support")}>Decline - can’t support</GoalButton>
          <GoalButton variant="outline" onClick={() => void decide("declined", "timing")}>Decline - not now</GoalButton>
        </div>
      </GoalFrame>
    );
  }
  const accepted = state === "approved";
  return (
    <GoalFrame>
      <div role="status">
        <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink">{accepted ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}{accepted ? "Recorded" : "Passed"}</p>
        <h1 className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">{accepted ? "Request accepted." : "Passed privately."}</h1>
        {accepted ? null : <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">The job seeker sees your reason without your name, and their ask stays open to other verified employees.</p>}
        <div className="mt-6"><GoalButton variant="primary" onClick={() => go("/inbox")}>Open My Company Inbox</GoalButton></div>
      </div>
    </GoalFrame>
  );
}
