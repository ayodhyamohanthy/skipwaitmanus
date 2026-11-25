import { lazy, Suspense } from "react";
const GoalOnboarding = lazy(() => import("./goal/onboarding/GoalOnboarding"));

export default function Onboarding() {
  return <Suspense fallback={null}><GoalOnboarding /></Suspense>;
}
