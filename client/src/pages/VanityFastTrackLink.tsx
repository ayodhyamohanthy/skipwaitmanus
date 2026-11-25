import { lazy, Suspense } from "react";

const GoalVanityFastTrackLink = lazy(() => import("./goal/links/GoalPrivateLinkLanding").then(module => ({ default: module.GoalVanityFastTrackLink })));

export default function VanityFastTrackLink() {
  return (
    <Suspense fallback={null}>
      <GoalVanityFastTrackLink />
    </Suspense>
  );
}
