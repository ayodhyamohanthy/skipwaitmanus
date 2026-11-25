import { lazy, Suspense } from "react";

const GoalHelp = lazy(() => import("./goal/support/GoalHelp"));

export default function Help() {
  return <Suspense fallback={null}><GoalHelp /></Suspense>;
}
