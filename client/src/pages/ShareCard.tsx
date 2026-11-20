import { lazy, Suspense } from "react";

const GoalShareCard = lazy(() => import("./goal/links/GoalShareCard"));

export default function ShareCard() {
  return (
    <Suspense fallback={null}>
      <GoalShareCard />
    </Suspense>
  );
}
