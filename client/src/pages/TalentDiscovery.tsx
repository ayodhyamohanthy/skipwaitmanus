import { lazy, Suspense } from "react";

const GoalEmployerTalent = lazy(() => import("./goal/employer-talent/GoalEmployerTalent"));

export default function TalentDiscovery() {
  return <Suspense fallback={null}><GoalEmployerTalent /></Suspense>;
}
