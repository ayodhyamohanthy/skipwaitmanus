import { lazy, Suspense } from "react";

const GoalReferrerImpact = lazy(() => import("./goal/referrer/GoalReferrerImpact"));

export default function ReferrerImpact() {
  return (
    <Suspense fallback={null}>
      <GoalReferrerImpact />
    </Suspense>
  );
}
