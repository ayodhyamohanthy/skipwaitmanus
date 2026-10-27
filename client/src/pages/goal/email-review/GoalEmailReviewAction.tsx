// Goal /email-review/:linkToken (D-048-p3-email-review; packet
// docs/plans/D-048-referrer.md). Goal-first rebuild of the kit review-action
// card: one decision, recorded only on an explicit press. Standalone frame
// (the route is not wrapped in AppShell), ink-on-canvas, one primary commit.
// Fetch/decision flow is the kit's, runtime-validated and fail-closed.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { Check, Lock, X } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { GoalButton } from "@/components/goal";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { readApiJson } from "@/lib/apiResponse";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { captureClientError, scrubSentryUrl } from "@/lib/sentry";

export const GOAL_PAGE = { goalLine: "Decide on this referral." };

const ReviewReadySchema = z.object({
  review: z.object({
    ready: z.literal(true),
    decisions: z.array(z.string()).optional(),
  }),
});

const ReviewDecisionSchema = z.object({
  status: z.enum(["approved", "declined"]),
  declineReason: z.string().optional().nullable(),
});

type Decision = "approved" | "declined";
type DeclineReason = "role_not_a_fit" | "cannot_support" | "timing";

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

export default function GoalEmailReviewAction() {
  const [, params] = useRoute("/email-review/:linkToken");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [state, setState] = useState<"loading" | "review" | "approved" | "passed" | "error">("loading");
  const [error, setError] = useState("");
  const [ethicsConfirmed, setEthicsConfirmed] = useState(false);

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
      const parsed = ReviewReadySchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error((payload.error as string) || "This private review link is unavailable");
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
        const parsed = ReviewReadySchema.safeParse(payload);
        if (!response.ok || !parsed.success) {
          throw new Error((payload.error as string) || "This private review link is unavailable");
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

  const decide = async (decision: Decision, declineReason?: DeclineReason) => {
    setState("loading");
    try {
      const token = await getTokenRef.current();
      const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params!.linkToken)}/decision`, {
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
      const parsed = ReviewDecisionSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error((payload.error as string) || "This private review action could not be completed");
      }
      setState(parsed.data.status === "approved" ? "approved" : "passed");
    } catch (reason) {
      setError(getErrorMessageAndReport(reason, "email-review-decision", reviewPath));
      setState("error");
    }
  };

  if (!params?.linkToken) return <GoalFrame><h1 className="text-g-display">Review link unavailable</h1></GoalFrame>;

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
