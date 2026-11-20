import { lazy, Suspense } from "react";

const GoalFastTrackLink = lazy(() => import("./goal/links/GoalPrivateLinkLanding").then(module => ({ default: module.GoalFastTrackLink })));

export default function FastTrackLink() {
  return (
    <Suspense fallback={null}>
      <GoalFastTrackLink />
    </Suspense>
  );
}
