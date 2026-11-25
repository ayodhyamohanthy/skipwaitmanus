import { lazy, Suspense } from "react";

const GoalJobs = lazy(() => import("./goal/discovery/GoalJobs"));

export default function JobExplorer() {
  return <Suspense fallback={null}><GoalJobs /></Suspense>;
}
