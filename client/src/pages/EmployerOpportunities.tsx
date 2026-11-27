// D-048-K-employer (D-332, packet docs/plans/D-048-retire.md §3): the old kit
// body and its goalSurfaceOn switch are gone, so this route renders the goal
// page alone. The file keeps its path and default export name so
// client/src/App.tsx and every importer stay untouched. The goal page is still
// loaded lazily, exactly as the switch's on-branch did, so the chunking and the
// first-paint behaviour do not change.
import { lazy, Suspense } from "react";

const GoalEmployerOpportunities = lazy(() => import("./goal/employer/GoalEmployerOpportunities"));

export default function EmployerOpportunities() {
  return <Suspense fallback={null}><GoalEmployerOpportunities /></Suspense>;
}
