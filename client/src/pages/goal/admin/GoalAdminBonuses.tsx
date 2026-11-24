// D-099 slice A (D-374): /admin/bonuses. An admin enters one current, sourced
// referral-bonus figure per company, withdraws it, and decides the reports people
// file. The employer sets and pays its own programme; skipwait.me never pays
// referrers (D-055, D-063). No public bonus page exists (D-374).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, ADMIN_NETWORK_ERROR } from "@/components/admin/adminApi";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { formatBonus, type PublicBonus } from "@shared/referralBonus";
import { AdminGoalFrame, AdminGoalHeading } from "./AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Keep every published referral bonus sourced and current." } as const;

type AdminRow = {
  company: { id: number; slug: string; name: string; initials: string; status: "listed" | "hidden" };
  bonus: (PublicBonus & { stale: boolean }) | null;
  openReports: number;
};

type ReportRow = { id: number; company: { slug: string; name: string }; reason: string; note: string | null; suggestedSourceUrl: string | null; status: "open" | "fixed" | "dismissed"; createdAt: string };

const CONTROL = "mt-1 block w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 py-2 text-g-body text-g-ink";
const LIST_KEY = ["admin-company-bonuses"];
const REPORTS_KEY = ["admin-company-bonus-reports"];

async function call<T>(path: string, method: "GET" | "PUT" | "POST", getToken: () => Promise<string | null | undefined>, body?: unknown): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: "include", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new Error(ADMIN_NETWORK_ERROR);
  }
  if (response.status === 401 || response.status === 403) throw new AdminAccessError(ADMIN_ACCESS_MESSAGE);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "We could not save that");
  return payload as T;
}

type FormState = { amount: string; currency: string; upTo: boolean; scopeNote: string; sourceUrl: string; checkedAt: string };

const emptyForm = (): FormState => ({ amount: "", currency: "INR", upTo: false, scopeNote: "", sourceUrl: "", checkedAt: new Date().toISOString().slice(0, 10) });

export default function GoalAdminBonuses() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const list = useQuery({
    queryKey: LIST_KEY,
    enabled: Boolean(isSignedIn),
    retry: (count, error) => !(error instanceof AdminAccessError) && count < 1,
    queryFn: async () => (await call<{ bonuses: AdminRow[] }>("/api/admin/company-bonuses", "GET", getToken)).bonuses,
  });
  const reports = useQuery({
    queryKey: REPORTS_KEY,
    enabled: Boolean(isSignedIn),
    retry: (count, error) => !(error instanceof AdminAccessError) && count < 1,
    queryFn: async () => (await call<{ reports: ReportRow[] }>("/api/admin/company-bonus-reports?status=open", "GET", getToken)).reports,
  });

  const save = useMutation({
    mutationFn: async (row: AdminRow) => {
      const digits = form.currency === "JPY" ? 0 : 2;
      const amountMinor = Math.round(Number(form.amount) * 10 ** digits);
      return call("/api/admin/company-bonuses/" + row.company.id, "PUT", getToken, {
        amountMinor,
        currency: form.currency,
        upTo: form.upTo,
        scopeNote: form.scopeNote.trim() ? form.scopeNote.trim() : null,
        sourceUrl: form.sourceUrl.trim(),
        checkedAt: new Date(form.checkedAt).toISOString(),
      });
    },
    onSuccess: () => { setSelected(null); setForm(emptyForm()); void client.invalidateQueries({ queryKey: LIST_KEY }); },
  });

  const withdraw = useMutation({
    mutationFn: async (row: AdminRow) => call("/api/admin/company-bonuses/" + row.company.id + "/withdraw", "POST", getToken),
    onSuccess: () => { setConfirmWithdraw(false); setSelected(null); void client.invalidateQueries({ queryKey: LIST_KEY }); },
  });

  const decide = useMutation({
    mutationFn: async (input: { id: number; decision: "fixed" | "dismissed" }) => call("/api/admin/company-bonus-reports/" + input.id + "/decision", "POST", getToken, { decision: input.decision }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: REPORTS_KEY }); void client.invalidateQueries({ queryKey: LIST_KEY }); },
  });

  const denied = list.error instanceof AdminAccessError || reports.error instanceof AdminAccessError;

  if (!isSignedIn) {
    return <AdminGoalFrame screen="admin-bonuses"><GoalEmptyState title="Sign in to continue" body="Administrator access is required." action={{ label: "Sign in", onClick: openSignIn }} /></AdminGoalFrame>;
  }
  if (denied) {
    return <AdminGoalFrame screen="admin-bonuses"><GoalEmptyState title="Administrator access is required." body={ADMIN_ACCESS_MESSAGE} /></AdminGoalFrame>;
  }

  return (
    <AdminGoalFrame screen="admin-bonuses">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="One current figure per company, entered from the employer's own page. The employer sets and pays its own programme; skipwait.me never pays referrers." />
      {list.isLoading ? <GoalSkeletonRows density="company" count={5} /> : list.isError ? <GoalErrorState title="We could not load referral bonuses" body={(list.error as Error).message} retry={{ label: "Try again", onClick: () => void list.refetch() }} /> : (
        <ul className="mt-4 divide-y divide-g-hairline">
          {(list.data ?? []).map(row => (
            <li key={row.company.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-g-label text-g-ink">{row.company.name}{row.company.status === "hidden" ? " (hidden)" : ""}</p>
                  <p className="text-g-meta text-g-ink-2">
                    {row.bonus ? <>{formatBonus(row.bonus)}{row.bonus.stale ? " · stale" : ""} · {row.bonus.sourceHost}</> : "No figure"}
                    {row.openReports > 0 ? ` · ${row.openReports} open report${row.openReports === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <GoalButton size="sm" variant="outline" onClick={() => { setSelected(row); setForm(row.bonus ? { amount: String(row.bonus.amountMinor / 10 ** (row.bonus.currency === "JPY" ? 0 : 2)), currency: row.bonus.currency, upTo: row.bonus.upTo, scopeNote: row.bonus.scopeNote ?? "", sourceUrl: row.bonus.sourceUrl, checkedAt: row.bonus.checkedAt.slice(0, 10) } : emptyForm()); }}>Edit</GoalButton>
              </div>
              {selected?.company.id === row.company.id && (
                <div className="mt-3 space-y-2 rounded-g-card border border-g-hairline p-3">
                  <label className="block text-g-label text-g-ink">Amount<input className={CONTROL} inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>
                  <label className="block text-g-label text-g-ink">Currency<input className={CONTROL} maxLength={3} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
                  <label className="flex items-center gap-2 text-g-label text-g-ink"><input type="checkbox" checked={form.upTo} onChange={event => setForm({ ...form, upTo: event.target.checked })} />Up to this amount</label>
                  <label className="block text-g-label text-g-ink">Scope note (optional)<input className={CONTROL} maxLength={120} value={form.scopeNote} onChange={event => setForm({ ...form, scopeNote: event.target.value })} /></label>
                  <label className="block text-g-label text-g-ink">Source on the company&apos;s own site<input className={CONTROL} type="url" value={form.sourceUrl} onChange={event => setForm({ ...form, sourceUrl: event.target.value })} /></label>
                  <label className="block text-g-label text-g-ink">Checked on<input className={CONTROL} type="date" value={form.checkedAt} onChange={event => setForm({ ...form, checkedAt: event.target.value })} /></label>
                  {save.isError && <p role="alert" className="text-g-meta text-g-ink">{save.error instanceof Error ? save.error.message : "We could not save that"}</p>}
                  <div className="flex flex-wrap gap-2">
                    <GoalButton size="sm" busy={save.isPending} busyLabel="Saving" onClick={() => save.mutate(row)}>Save figure</GoalButton>
                    <GoalButton size="sm" variant="outline" onClick={() => setSelected(null)}>Cancel</GoalButton>
                    {row.bonus && (confirmWithdraw
                      ? <GoalButton size="sm" variant="outline" busy={withdraw.isPending} busyLabel="Withdrawing" onClick={() => withdraw.mutate(row)}>Confirm withdraw</GoalButton>
                      : <GoalButton size="sm" variant="outline" onClick={() => setConfirmWithdraw(true)}>Withdraw</GoalButton>)}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <section className="mt-8">
        <h2 className="text-g-label text-g-ink">Open reports</h2>
        {reports.isLoading ? <GoalSkeletonRows density="company" count={2} /> : reports.isError ? <GoalErrorState title="We could not load reports" body={(reports.error as Error).message} retry={{ label: "Try again", onClick: () => void reports.refetch() }} /> : (reports.data ?? []).length === 0 ? <p className="mt-2 text-g-meta text-g-ink-2">No open reports.</p> : (
          <ul className="mt-2 divide-y divide-g-hairline">
            {(reports.data ?? []).map(report => (
              <li key={report.id} className="py-3">
                <p className="text-g-label text-g-ink">{report.company.name} · {report.reason}</p>
                {report.note && <p className="text-g-meta text-g-ink-2">{report.note}</p>}
                {report.suggestedSourceUrl && <p className="text-g-meta text-g-ink-2">{report.suggestedSourceUrl}</p>}
                <div className="mt-2 flex gap-2">
                  <GoalButton size="sm" onClick={() => decide.mutate({ id: report.id, decision: "fixed" })}>Fixed</GoalButton>
                  <GoalButton size="sm" variant="outline" onClick={() => decide.mutate({ id: report.id, decision: "dismissed" })}>Dismissed</GoalButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminGoalFrame>
  );
}
