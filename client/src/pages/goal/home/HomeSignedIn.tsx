// D-048-p3-home-signed-in (packet docs/plans/D-048-marketing.md §3): the
// signed-in home is a router, not a dashboard. It renders one frame and sends
// the person to the surface their account already earns:
//   - while auth loads: the fetch-free goal frame (GoalStaticFrame fetches
//     nothing), never a flash of the landing;
//   - a verified referrer (the server's verdict, D-055) -> /referrer-home;
//     a verified session that still needs the in-session work-email step-up
//     goes there too, because the step-up belongs to that surface;
//   - a seeker with no verified work email -> /explore;
//   - a failed verdict check -> plain words and a retry, never a guess.
// It reads no email, plan, wallet or profile data of its own.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { GoalErrorState } from "@/components/goal";
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";

export type HomeDestination = "/referrer-home" | "/explore";

export function destinationFor(status: string): HomeDestination | null {
  if (status === "verified" || status === "code_required") return "/referrer-home";
  if (status === "unverified") return "/explore";
  return null;
}

export function HomeSignedIn() {
  const access = useReferrerAccess();
  const [, navigate] = useLocation();
  const destination = destinationFor(access.status);

  useEffect(() => {
    if (destination) navigate(destination, { replace: true });
  }, [destination, navigate]);

  if (access.status === "error") {
    return (
      <GoalStaticFrame status="We couldn't check your referral access">
        <GoalErrorState
          className="px-0"
          title="We couldn't check your referral access."
          body={access.retrying ? "Trying again…" : access.error.message}
          retry={{ label: "Try again", onClick: access.retry }}
        />
      </GoalStaticFrame>
    );
  }

  const checking = access.status === "checking";
  return (
    <GoalStaticFrame>
      <p role="status" className="text-g-body text-g-ink-2">
        {checking ? "Checking your referral access — taking you to the right place." : "Opening skipwait.me — one moment while we open your account."}
      </p>
    </GoalStaticFrame>
  );
}

export default HomeSignedIn;
