import { lazy, Suspense } from "react";

export { ReferralCoverageInviteBanner } from "@/components/referrer/CoverageInviteBanner";

const GoalReferrer = lazy(() => import("./goal/referrer/GoalReferrer"));

export default function Referrer() {
  return (
    <Suspense fallback={null}>
      <GoalReferrer />
    </Suspense>
  );
}
