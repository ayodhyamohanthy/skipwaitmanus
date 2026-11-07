// Goal /admin/token-recovery (D-048-p3-admin-money). authFetch, loadHistory,
// searchUsers and grant are copied verbatim from AdminTokenRecovery.tsx - the
// confirmed:true guard, the support reference and the audit history all stay.
// Only the presentation changes (packet §4.1, §4.3).
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalEmptyState, GoalErrorState } from "@/components/goal/GoalStates";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { AdminMoneyGoalFrame, AdminMoneyHeading } from "./AdminMoneyGoalFrame";
import { MONEY_GOAL_LINE } from "./adminMoneyCopy";

export const GOAL_PAGE = { goalLine: MONEY_GOAL_LINE } as const;

type RecoveryUser = { id: number; name: string | null; email: string | null };
type Adjustment = { id: number; recipientUserId: number; recipientName: string | null; recipientEmail: string | null; role: "job_seeker" | "referrer"; tokenCount: number; caseReference: string; reason: string; createdAt: string };

export default function GoalAdminTokenRecovery() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [query, setQuery] = useState(""); const [users, setUsers] = useState<RecoveryUser[]>([]); const [selected, setSelected] = useState<RecoveryUser | null>(null);
  const [role, setRole] = useState<"job_seeker" | "referrer">("job_seeker"); const [tokenCount, setTokenCount] = useState(1); const [caseReference, setCaseReference] = useState(""); const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<Adjustment[]>([]); const [searching, setSearching] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");

  const authFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "We could not complete this administrator action");
    return payload;
  };
  const loadHistory = async () => { if (!isSignedIn) return; try { const payload = await authFetch("/api/admin/token-recovery/adjustments"); setHistory(payload.adjustments || []); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load recovery history"); } };
  useEffect(() => { void loadHistory(); }, [isSignedIn]);
  const searchUsers = async (event: FormEvent) => { event.preventDefault(); if (query.trim().length < 2) { setError("Enter at least two characters to find a user."); return; } setSearching(true); setError(""); setSuccess(""); try { const payload = await authFetch(`/api/admin/token-recovery/users?query=${encodeURIComponent(query.trim())}`); setUsers(payload.users || []); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not find user accounts"); } finally { setSearching(false); } };
  const grant = async (event: FormEvent) => { event.preventDefault(); if (!selected) { setError("Choose the user who needs a token recovery grant."); return; } if (!confirmed) { setError("Confirm that you reviewed the payment or support issue first."); return; } setSaving(true); setError(""); setSuccess(""); try { const payload = await authFetch("/api/admin/token-recovery/grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientUserId: selected.id, role, tokenCount, caseReference, reason, confirmed: true }) }); setSuccess(`${payload.grant.tokenCount} credit${payload.grant.tokenCount === 1 ? "" : "s"} added. New ${role === "job_seeker" ? "Job Seeker" : "Referrer"} balance: ${payload.grant.newBalance}.`); setCaseReference(""); setReason(""); setConfirmed(false); await loadHistory(); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not create this recovery grant"); } finally { setSaving(false); } };

  if (!isSignedIn) {
    return (
      <AdminMoneyGoalFrame screen="admin-token-recovery-sign-in" current="/admin/token-recovery">
        <AdminMoneyHeading current="/admin/token-recovery" />
        <GoalNextStep reason="Sign in with the designated administrator account to review payment-support cases and create audited recovery grants.">
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminMoneyGoalFrame>
    );
  }

  return (
    <AdminMoneyGoalFrame screen="admin-token-recovery" current="/admin/token-recovery">
      <AdminMoneyHeading current="/admin/token-recovery" />
      {error ? <GoalErrorState title={error} retry={{ label: "Try again", onClick: () => setError("") }} /> : null}
      {success ? <p role="status" className="mb-6 border border-g-hairline bg-g-surface p-4 text-g-body text-g-ink">{success}</p> : null}
      <section aria-label="Find the account" className="border border-g-hairline bg-g-surface p-4">
        <h2 className="text-g-label text-g-ink">Find the account</h2>
        <form onSubmit={searchUsers} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="recovery-user-query">Name or email</label>
          <input id="recovery-user-query" aria-label="Find a user by name or email" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or email" className="min-h-(--g-control-h) flex-1 rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink" />
          <GoalButton type="submit" variant="outline" busy={searching} busyLabel="Finding…">Find</GoalButton>
        </form>
        <ul className="mt-3 grid gap-1">
          {users.map(user => (
            <li key={user.id}>
              <button type="button" onClick={() => { setSelected(user); setError(""); }} className="block w-full rounded-g-control border border-g-hairline p-3 text-left text-g-body hover:bg-g-surface-hover">
                <span className="block text-g-label text-g-ink">{user.name || "Unnamed account"}</span>
                <span className="block truncate text-g-meta text-g-ink-3">{user.email || `Account #${user.id}`}</span>
              </button>
            </li>
          ))}
        </ul>
        {query && !searching && !users.length ? <p className="mt-3 text-g-meta text-g-ink-3">No matching account found yet.</p> : null}
      </section>
      <GoalNextStep reason="Record one reasoned grant. The support reference, the account and your confirmation are all required; every grant stays in the audit history.">
        <form onSubmit={grant} className="mt-3 grid gap-3">
          <p className="text-g-body text-g-ink-2">{selected ? `Selected: ${selected.name || "Unnamed account"}${selected.email ? ` · ${selected.email}` : ""}` : "Select an account from the search results before creating a grant."}</p>
          <div className="grid gap-3 gdesk:grid-cols-2">
            <label className="text-g-label text-g-ink">Wallet role
              <select value={role} onChange={event => setRole(event.target.value as "job_seeker" | "referrer")} className="mt-2 block w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink">
                <option value="job_seeker">Job Seeker</option><option value="referrer">Referrer</option>
              </select>
            </label>
            <label className="text-g-label text-g-ink">Credits to add
              <input aria-label="Credits to add" value={tokenCount} onChange={event => setTokenCount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} type="number" min="1" max="1000" inputMode="numeric" className="mt-2 block w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink" />
            </label>
          </div>
          <label className="text-g-label text-g-ink">Payment or support reference
            <input value={caseReference} onChange={event => setCaseReference(event.target.value)} maxLength={120} placeholder="e.g. CB-HP-123 or support ticket" className="mt-2 block w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink" />
          </label>
          <label className="text-g-label text-g-ink">Reason
            <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder="What went wrong, and why this grant resolves it" className="mt-2 block min-h-20 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink" />
          </label>
          <label className="flex items-start gap-3 text-g-body text-g-ink">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0 accent-g-ink" />
            <span>I reviewed the payment or support issue. This grant adds credits only; it never marks a payment as paid or bypasses the verified webhook record.</span>
          </label>
          <GoalButton type="submit" variant="primary" busy={saving} busyLabel="Recording…" disabledReason={saving ? undefined : !selected ? "Choose an account first." : !confirmed ? "Confirm you reviewed the case first." : !caseReference.trim() ? "Add the payment or support reference first." : !reason.trim() ? "Write the reason first." : undefined}>Record the recovery grant</GoalButton>
        </form>
      </GoalNextStep>
      <section aria-label="Audit history" className="mt-6 border border-g-hairline bg-g-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-g-hairline p-4">
          <h2 className="text-g-label text-g-ink">Recent recovery grants</h2>
          <GoalStatus status="accepted" label={`${history.length} recorded`} />
        </div>
        {history.length ? (
          <ul>{history.map(item => (
            <li key={item.id} className="grid gap-1 border-b border-g-hairline p-4 last:border-b-0">
              <span className="text-g-label text-g-ink">+{item.tokenCount} · {item.role === "job_seeker" ? "Job Seeker" : "Referrer"}</span>
              <span className="text-g-meta text-g-ink-3">{item.recipientName || "Unnamed account"} · {item.caseReference} · {new Date(item.createdAt).toLocaleString()}</span>
              <span className="text-g-meta text-g-ink-2">{item.reason}</span>
            </li>
          ))}</ul>
        ) : <GoalEmptyState title="No recovery grants have been recorded." body="Every reasoned grant is retained here, separately from payment fulfillment." />}
      </section>
    </AdminMoneyGoalFrame>
  );
}
