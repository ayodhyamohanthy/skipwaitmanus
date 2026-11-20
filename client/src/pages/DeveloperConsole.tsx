import { lazy, Suspense } from "react";
const GoalDeveloperConsole = lazy(() => import("./goal/developers/GoalDeveloperConsole"));

export default function DeveloperConsole() {
  return <Suspense fallback={null}><GoalDeveloperConsole /></Suspense>;
}
