import { lazy, Suspense } from "react";

// D-048-K-employer-billing keeps the route export and renders only the goal page.
const GoalEmployerBilling = lazy(() => import("./goal/employer-billing/GoalEmployerBilling"));

export default function EmployerBilling() {
  return (
    <Suspense fallback={null}>
      <GoalEmployerBilling />
    </Suspense>
  );
}
