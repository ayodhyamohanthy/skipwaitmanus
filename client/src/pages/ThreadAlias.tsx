import { Redirect, useRoute } from "wouter";
import UnifiedInbox from "./UnifiedInbox";
import { AppShell } from "../components/AppShell";

// Canonical v4 route: /thread (list) + /thread/:requestId (one request thread).
// Live implementation lives at /inbox + /conversation/:requestId; this alias
// keeps the v4 URL working with real data instead of a preview fork.
export function ThreadListAlias() {
  return (
    <AppShell>
      <UnifiedInbox />
    </AppShell>
  );
}

export function ThreadDetailAlias() {
  const [, params] = useRoute("/thread/:requestId");
  const id = params?.requestId ?? "";
  // Reuse the real thread (identity gating, accept/pass, messaging) by
  // delegating when the id is numeric; otherwise fall back to inbox.
  if (!/^\d+$/.test(id)) return <Redirect to="/inbox" />;
  return <Redirect to={`/conversation/${id}`} />;
}
