import { GoalAppShell } from "@/components/goal";
import GoalConnectAssistant from "./GoalConnectAssistant";

/** /connect-assistant is not wrapped in AppShell, so its goal route owns the shell. */
export default function GoalConnectAssistantRoute() {
  return (
    <GoalAppShell active="find" pageTitle="Connect assistant">
      <GoalConnectAssistant />
    </GoalAppShell>
  );
}
