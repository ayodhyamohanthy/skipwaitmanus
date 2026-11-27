import React, { lazy, Suspense } from "react";

const GoalPremium = lazy(() => import("./goal/premium/GoalPremium"));

export default function Premium() {
  return <Suspense fallback={null}><GoalPremium /></Suspense>;
}
