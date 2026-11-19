import { lazy, Suspense } from "react";
const GoalSuggestCompany = lazy(() => import("./goal/seeker-small/GoalSuggestCompany"));

export default function SuggestCompany() {
  return <Suspense fallback={null}><GoalSuggestCompany /></Suspense>;
}
