import { lazy, Suspense } from "react";
const GoalOffline = lazy(() => import("./goal/system/GoalOffline"));

export default function Offline() {
  return <Suspense fallback={null}><GoalOffline /></Suspense>;
}
