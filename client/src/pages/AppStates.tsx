import { lazy, Suspense } from "react";
const GoalAppStates = lazy(() => import("./goal/system/GoalAppStates"));
export default function AppStates() {
  return <Suspense fallback={null}><GoalAppStates /></Suspense>;
}

