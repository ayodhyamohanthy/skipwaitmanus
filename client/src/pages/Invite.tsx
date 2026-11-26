import { lazy, Suspense } from "react";

const GoalInvite = lazy(() => import("./goal/invite/GoalInvite"));

export default function Invite() {
  return (
    <Suspense fallback={null}>
      <GoalInvite />
    </Suspense>
  );
}
