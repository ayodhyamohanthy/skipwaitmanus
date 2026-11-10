// Signed-in home (D-048-p3-home-signed-in, packet docs/plans/D-048-marketing.md
// §3): a router, not a dashboard. A seeker goes to /explore and a verified
// referrer to /referrer-home on the server's verdict (D-055) - never a client
// email check. While the verdict is in flight the fetch-free frame shows; a
// failed check is visible with a retry instead of a silent misroute.
import { Redirect } from "wouter";
import { GoalErrorState } from "@/components/goal";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import GoalHomeLoading from "./GoalHomeLoading";

export function GoalHomeSignedIn() {
  const access = useReferrerAccess();

  // A referrer who still owes the in-session work-email step-up is a referrer:
  // /referrer-home owns that step (D-057, D-245), so route them there too.
  if (access.status === "verified" || access.status === "code_required") return <Redirect to="/referrer-home" />;
  if (access.status === "unverified" || access.status === "signed-out") return <Redirect to="/explore" />;
  if (access.status === "checking") return <GoalHomeLoading />;

  return (
    <div data-testid="goal-home-signed-in" className="min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <main className="g-scope mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Get referred.</h1>
        <GoalErrorState
          title="We couldn't check whether you're a verified referrer."
          body={access.error.message || undefined}
          retry={{ label: access.retrying ? "Trying again…" : "Try again", onClick: access.retry }}
          className="mt-6"
        />
        <p className="mt-4 text-g-meta text-g-ink-2">
          You can still{" "}
          <a href="/explore" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">
            find a referral
          </a>{" "}
          while this is fixed.
        </p>
      </main>
    </div>
  );
}

export default GoalHomeSignedIn;
