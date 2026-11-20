import { lazy, Suspense } from "react";

const GoalProfile = lazy(() => import("./goal/profile/GoalProfile"));

export default function Profile() {
  return <Suspense fallback={null}><GoalProfile /></Suspense>;
}
