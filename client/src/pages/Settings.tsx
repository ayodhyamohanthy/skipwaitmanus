import { lazy, Suspense } from "react";

const GoalSettings = lazy(() => import("./goal/settings/GoalSettings"));

export default function Settings() {
  return <Suspense fallback={null}><GoalSettings /></Suspense>;
}
