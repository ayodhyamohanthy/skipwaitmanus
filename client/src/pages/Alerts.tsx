import { lazy, Suspense } from "react";

const GoalAlerts = lazy(() => import("./goal/alerts/GoalAlerts"));

export default function Alerts() {
  return <Suspense fallback={null}><GoalAlerts /></Suspense>;
}
