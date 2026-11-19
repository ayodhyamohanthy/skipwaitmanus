import { lazy, Suspense } from "react";

const GoalEmployerBilling = lazy(() => import("./goal/employer-billing/GoalEmployerBilling"));

export default function EmployerBilling() {
  return <Suspense fallback={null}><GoalEmployerBilling /></Suspense>;
}
