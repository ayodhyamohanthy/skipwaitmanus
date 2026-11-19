import { lazy, Suspense } from "react";
import { GoalInboxChunkLoading } from "./goal/inbox/GoalInboxChunkLoading";

const GoalInbox = lazy(() => import("./goal/inbox/GoalInbox"));

export default function UnifiedInbox() {
  return <Suspense fallback={<GoalInboxChunkLoading />}><GoalInbox /></Suspense>;
}
