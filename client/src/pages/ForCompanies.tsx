import { lazy, Suspense } from "react";

const GoalForCompanies = lazy(() => import("./goal/for-companies/GoalForCompanies"));

export default function ForCompanies() {
  return <Suspense fallback={null}><GoalForCompanies /></Suspense>;
}
