import { lazy, Suspense } from "react";
const GoalDevelopers = lazy(() => import("./goal/developers/GoalDevelopers"));

export default function Developers() {
  return <Suspense fallback={null}><GoalDevelopers /></Suspense>;
}
