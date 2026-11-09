// Goal /email-review/:linkToken (D-048-p3-email-review; packet
// docs/plans/D-048-referrer.md). Goal-first rebuild of the kit review-action
// card: one decision, recorded only on an explicit press. Standalone frame
// (the route is not wrapped in AppShell), ink-on-canvas, one primary commit.
// Fetch/decision flow is the kit's, runtime-validated and fail-closed.
import { useEffect, useRef, useState, useCallback, useContext } from "react";
import { useAuth } from "@/_core/auth";
import { Check, Lock, X } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { QueryClient, QueryClientProvider, QueryClientContext, useQuery } from "@tanstack/react-query";
import { GoalButton } from "@/components/goal";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalWorkEmailStepUp } from "@/components/goal/GoalWorkEmailStepUp";
import { fetchCompanyAccess } from "@/components/referrer-home/referrerData";
import { referrerAccessKey } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { isWorkEmailCodeRequired, notifyWorkEmailCodeRequired } from "@/lib/referrerStepUpApi";
import { captureClientError, scrubSentryUrl } from "@/lib/sentry";

export const GOAL_PAGE = { goalLine: "Decide on this referral." };

const ReviewReadySchema = z.object({
  review: z.object({
    ready: z.literal(true),
    decisions: z.array(z.string()).optional(),
  }),
});

const ReviewDecisionSchema = z.object({
  status: z.enum(["approved", "passed"]),
  declineReason: z.string().optional().nullable(),
});

type Decision = "approved" | "declined";
type DeclineReason = "role_not_a_fit" | "cannot_support" | "timing";
// D-057 (§0b.8b): `code_required` — the review link answered 403 work_email_code_required,
// so a signed-in person confirms their work email in place (the ordinary access verdict's
// step-up), never the standalone code sign-in, and the same link is retried afterwards.
type State = "loading" | "review" | "approved" | "passed" | "error" | "code_required";

function getErrorMessageAndReport(reason: unknown, source: string, path: string): string {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (isOffline) return "You are currently offline. Check your connection and try again.";
  const isNetworkFailure = reason instanceof Error && (reason.name === "TypeError" || /failed to fetch|networkerror/i.test(reason.message));
  if (isNetworkFailure) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    captureClientError(reason, {
      source,
      url: scrubSentryUrl(path, origin),
    });
    return "Unable to reach the server. Please check your connection and try again.";
  }
  return reason instanceof Error ? reason.message : "This private review link is unavailable";
}

function GoalFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-g-canvas p-5 font-g-sans text-g-ink">
      <section className="w-full max-w-[560px] rounded-g-tile border border-g-hairline bg-g-surface p-6 gdesk:p-8">
        <GoalBrandMark />
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

// The in-place step-up panel (D-057 §0b.8b): it reads the ordinary access verdict
// lazily (only once the link answered work_email_code_required) on its own query
// client, so the page adds no request on the happy path and needs no provider above
// it. When the verdict comes back verified without a step-up requirement (the step-up
// confirmed, or the session already had a proof), the caller retries the same review
// link for the same account.
function StepUpPanel({ onVerified }: { onVerified: () => void }) {
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const accessQuery = useQuery({
    queryKey: referrerAccessKey(userId ?? null),
    queryFn: () => fetchCompanyAccess(getTokenRef.current),
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const access = accessQuery.data;
  useEffect(() => {
    if (access?.verified && !access.codeRequired) onVerified();
  }, [access?.verified, access?.codeRequired, onVerified]);
  if (!access || accessQuery.isFetching) return <p className="mt-4 text-g-small text-g-ink-2">Checking your work email…</p>;
  if (!access.verified) return <p role="alert" className="mt-4 text-g-small text-g-ink-2">This review link needs a verified work email. Use the link from the notification sent to your work address.</p>;
  return <GoalWorkEmailStepUp access={access} />;
}

/** The step-up island the kit and goal /email-review pages both render in the code_required state. */
export function GoalEmailReviewStepUpIsland({ onVerified }: { onVerified: () => void }) {
  // Standalone review routes can lack a provider. When a shell provider exists,
  // refresh its same-account access verdict too, not only this island's client.
  const outerClient = useContext(QueryClientContext);
  const { userId } = useAuth();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const resume = useCallback(() => {
    if (outerClient) void outerClient.invalidateQueries({ queryKey: referrerAccessKey(userId ?? null) });
    onVerified();
  }, [outerClient, userId, onVerified]);
  return <QueryClientProvider client={client}><StepUpPanel onVerified={resume} /></QueryClientProvider>;
}

export default function GoalEmailReviewAction() {
  const [, params] = useRoute("/email-review/:linkToken");
  const [, go] = useLocation();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");
  const [ethicsConfirmed, setEthicsConfirmed] = useState(false);
  const pendingDecision = useRef<{ decision: Decision; declineReason?: DeclineReason } | null>(null);

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const reviewPath = `/email-review/${encodeURIComponent(params?.linkToken ?? "")}`;

  const loadReview = async () => {
    if (!isSignedIn || !params?.linkToken) return;
    setState("loading");
    setError("");
    try {
      const token = await getTokenRef.current();
      const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await readApiJson<Record<string, unknown>>(response, "This private review link is unavailable");
      if (isWorkEmailCodeRequired(response.status, payload)) {
        notifyWorkEmailCodeRequired();
        setState("code_required");
        return;
      }
      const parsed = ReviewReadySchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        const message = typeof payload.error === "string" ? payload.error : "This private review link is unavailable";
        throw new Error(message);
      }
      setState("review");
    } catch (reason) {
      setError(getErrorMessageAndReport(reason, "email-review", reviewPath));
      setState("error");
    }
  };

  useEffect(() => {
    if (!isSignedIn || !params?.linkToken) return;
    let active = true;
    void (async () => {
      try {
        const token = await getTokenRef.current();
        const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await readApiJson<Record<string, unknown>>(response, "This private review link is unavailable");
        if (isWorkEmailCodeRequired(response.status, payload)) {
          notifyWorkEmailCodeRequired();
          setState("code_required");
          return;
        }
        const parsed = ReviewReadySchema.safeParse(payload);
        if (!response.ok || !parsed.success) {
          const message = typeof payload.error === "string" ? payload.error : "This private review link is unavailable";
          throw new Error(message);
        }
        if (active) setState("review");
      } catch (reason) {
        if (!active) return;
        setError(getErrorMessageAndReport(reason, "email-review", reviewPath));
        setState("error");
      }
    })();
    return () => { active = false; };
  }, [isSignedIn, params?.linkToken, reviewPath]);

  // D-057: after the in-session step-up confirms, the same review link (or the decision
  // the person explicitly pressed) is retried in place, for the same account.
  const resumeAfterStepUp = useCallback(() => {
    const pending = pendingDecision.current;
    pendingDecision.current = null;
    if (pending) void decide(pending.decision, pending.declineReason);
    else void loadReview();
  }, [isSignedIn, params?.linkToken]);

  const decide = async (decision: Decision, declineReason?: DeclineReason) => {
    if (!params?.linkToken) return;
    setState("loading");
    try {
      const token = await getTokenRef.current();
      const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}/decision`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          decision,
          ...(decision === "approved" ? { ethicsConfirmed: true } : {}),
          ...(declineReason ? { declineReason } : {}),
        }),
      });
      const payload = await readApiJson<Record<string, unknown>>(response, "This private review link is unavailable");
      if (isWorkEmailCodeRequired(response.status, payload)) {
        notifyWorkEmailCodeRequired();
        pendingDecision.current = { decision, declineReason };
        setState("code_required");
        return;
      }
      const parsed = ReviewDecisionSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        const message = typeof payload.error === "string" ? payload.error : "This private review action could not be completed";
        throw new Error(message);
      }
      setState(parsed.data.status === "approved" ? "approved" : "passed");
    } catch (reason) {
      setError(getErrorMessageAndReport(reason, "email-review-decision", reviewPath));
      setState("error");
    }
  };

  if (!params?.linkToken) return <GoalFrame><h1 className="text-g-display">Review link unavailable</h1></GoalFrame>;

  if (isLoaded === false) {
    return (
      <GoalFrame>
        <h1 className="text-g-display">Opening private review…</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">No decision is recorded until you press a confirmation button.</p>
      </GoalFrame>
    );
  }

  if (!isSignedIn) {
    const returnTo = `/email-review/${encodeURIComponent(params.linkToken)}`;
    return (
      <GoalFrame>
        <span className="grid h-11 w-11 place-items-center rounded-g-control border border-g-hairline">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">PRIVATE REVIEW</p>
        <h1 className="mt-3 text-g-display">Use your company email.</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Sign in with the verified work email that received this notification.</p>
        <div className="mt-6">
          <GoalButton variant="primary" asChild className="w-full">
            <a href={referrerSignInHref(returnTo)}>Sign in with work email</a>
          </GoalButton>
        </div>
      </GoalFrame>
    );
  }

  if (state === "code_required") {
    return (
      <GoalFrame>
        <h1 className="text-g-display">Confirm your work email.</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">One code keeps this review link on your account. No decision is recorded until you press a confirmation button.</p>
        <div className="mt-4">
          <GoalEmailReviewStepUpIsland onVerified={resumeAfterStepUp} />
        </div>
      </GoalFrame>
    );
  }

  if (state === "loading") {
    return (
      <GoalFrame>
        <h1 className="text-g-display">Opening private review…</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">No decision is recorded until you press a confirmation button.</p>
      </GoalFrame>
    );
  }

  if (state === "error") {
    return (
      <GoalFrame>
        <h1 className="text-g-display">Review link unavailable</h1>
        <p role="alert" className="mt-2 flex items-center gap-2 text-g-small text-g-ink">
          <X className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
        <div className="mt-6">
          <GoalButton variant="outline" className="w-full" onClick={() => void loadReview()}>
            Try again
          </GoalButton>
        </div>
      </GoalFrame>
    );
  }

  if (state === "review") {
    return (
      <GoalFrame>
        <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">PRIVATE REVIEW</p>
        <h1 className="mt-3 text-g-display">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Each button records the named action immediately.</p>
        <p className="mt-4 rounded-g-tile border border-g-hairline p-4 text-g-small leading-[1.6] text-g-ink-2">
          Accepting shares names both ways and the job seeker’s resume. Referring comes later, through your company’s own process.
        </p>
        <label className="mt-4 flex items-start gap-3 text-g-small text-g-ink">
          <input
            type="checkbox"
            checked={ethicsConfirmed}
            onChange={event => setEthicsConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-g-ink"
          />
          I’ll refer only through my company’s official process and won’t accept anything in return.
        </label>
        <div className="mt-5">
          <GoalNextStep reason="Confirm the official process line before accepting.">
            <div className="mt-3">
              <GoalButton
                variant="primary"
                className="w-full"
                disabledReason={ethicsConfirmed ? undefined : "Confirm the referral ethics line first"}
                onClick={() => void decide("approved")}
              >
                Accept &amp; connect
              </GoalButton>
            </div>
          </GoalNextStep>
        </div>
        <div className="mt-3 grid gap-2">
          <GoalButton variant="outline" onClick={() => void decide("declined", "role_not_a_fit")}>
            Decline - role not a fit
          </GoalButton>
          <GoalButton variant="outline" onClick={() => void decide("declined", "cannot_support")}>
            Decline - can’t support
          </GoalButton>
          <GoalButton variant="outline" onClick={() => void decide("declined", "timing")}>
            Decline - not now
          </GoalButton>
        </div>
      </GoalFrame>
    );
  }

  const accepted = state === "approved";
  return (
    <GoalFrame>
      <div role="status">
        <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink">
          {accepted ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
          {accepted ? "Recorded" : "Passed"}
        </p>
        <h1 className="mt-3 text-g-display">{accepted ? "Request accepted." : "Passed privately."}</h1>
        {accepted ? null : (
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">
            This referral request remains open to other verified colleagues.
          </p>
        )}
        <div className="mt-6">
          <GoalButton variant="primary" className="w-full" onClick={() => go("/inbox")}>
            Open My Company Inbox
          </GoalButton>
        </div>
      </div>
    </GoalFrame>
  );
}
