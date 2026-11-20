import { lazy, Suspense } from "react";

const GoalPublicProfile = lazy(() => import("./goal/public-profile/GoalPublicProfile"));

export default function PublicProfile() {
  return <Suspense fallback={null}><GoalPublicProfile /></Suspense>;
}
