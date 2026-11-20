import { lazy, Suspense } from "react";
const GoalEmails = lazy(() => import("./goal/system/GoalEmails"));

export default function Emails() {
  return <Suspense fallback={null}><GoalEmails /></Suspense>;
}
