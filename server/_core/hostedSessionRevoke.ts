/**
 * App sign-out only clears our own cookies. The hosted AuthKit session on WorkOS stays alive and would
 * silently sign the next typed email in as the previous account, so sign-out also revokes the signed-out
 * person's active hosted sessions. Fail-soft by design: sign-out must never fail because WorkOS did.
 */
type SessionsApi = {
  listSessions: (userId: string) => Promise<{ data?: Array<{ id: string; status?: string }> } & AsyncIterable<{ id: string; status?: string }>>;
  revokeSession: (payload: { sessionId: string }) => Promise<void>;
};

export async function revokeHostedSessions(api: SessionsApi | undefined, workosUserIds: readonly string[], options: { timeoutMs?: number; log?: (message: string) => void } = {}): Promise<{ revoked: number; failed: number }> {
  const log = options.log ?? (() => {});
  const result = { revoked: 0, failed: 0 };
  if (!api || typeof api.listSessions !== "function" || typeof api.revokeSession !== "function") return result;
  const work = (async () => {
    for (const userId of workosUserIds) {
      try {
        const page = await api.listSessions(userId);
        const sessions = Array.isArray(page.data) ? page.data : [];
        for (const session of sessions) {
          if (session.status && session.status !== "active") continue;
          try { await api.revokeSession({ sessionId: session.id }); result.revoked += 1; } catch { result.failed += 1; }
        }
      } catch { result.failed += 1; }
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => { timer = setTimeout(() => { log("hosted session revoke timed out"); resolve(); }, options.timeoutMs ?? 4000); });
  try { await Promise.race([work, timeout]); } finally { if (timer) clearTimeout(timer); }
  return result;
}
