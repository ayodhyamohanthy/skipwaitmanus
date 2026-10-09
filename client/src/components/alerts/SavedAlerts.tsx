import { Bell, BellOff, Plus, Search, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FREE_ALERT_LIMIT, type SeekerAlert } from "@shared/alerts";
import { Button } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import { ALERT_REMOVE_ERROR, ALERT_SAVE_ERROR, ALERT_UPDATE_ERROR, createSeekerAlert, deleteSeekerAlert, fetchSeekerAlerts, fetchSeekerPlan, setSeekerAlertPaused, type TokenSource } from "./seekerAlertsApi";

/** Kit company mark from the watched domain: "merkle.com" -> "M", "tata-consultancy.com" -> "TC". */
export function domainInitials(domain: string): string {
  const label = domain.split(".")[0] ?? "";
  return label.split(/[-_]/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "?";
}

function alertStatus(alert: SeekerAlert): string {
  if (alert.paused) return "Paused";
  return alert.notifiedAt ? "Notified — door open" : "Watching · instant";
}

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

/**
 * Kit Saved alerts tab (app/src/routes/alerts.tsx) on the real watch backend
 * (/api/seeker-alerts). A watch is a company domain; the first verified
 * referrer who enrolls there notifies every unpaused watcher once. Rows only
 * change after the server confirms; the Free cap is enforced server-side and
 * its message is shown as-is.
 */
export function SavedAlerts({ userId, getToken }: { userId: string | null; getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const listKey = ["alerts", "saved", userId ?? "session"] as const;
  const alerts = useQuery({ queryKey: listKey, retry: false, queryFn: () => fetchSeekerAlerts(getToken) });
  const plan = useQuery({ queryKey: ["alerts", "plan", userId ?? "session"], retry: false, queryFn: () => fetchSeekerPlan(getToken) });
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [rowError, setRowError] = useState("");
  const [busyIds, setBusyIds] = useState<readonly number[]>([]);

  const updateList = (change: (current: SeekerAlert[]) => SeekerAlert[]) =>
    queryClient.setQueryData<SeekerAlert[]>(listKey, current => (current ? change(current) : current));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const companyDomain = domain.trim();
    if (!companyDomain || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const created = await createSeekerAlert(companyDomain, getToken);
      updateList(current => [created, ...current.filter(item => item.id !== created.id)]);
      setDomain("");
      setAdding(false);
    } catch (reason) {
      setFormError(messageOf(reason, ALERT_SAVE_ERROR));
    } finally { setSaving(false); }
  };

  const runRowAction = async (alert: SeekerAlert, action: () => Promise<void>, fallback: string) => {
    if (busyIds.includes(alert.id)) return;
    setBusyIds(current => [...current, alert.id]);
    setRowError("");
    try { await action(); } catch (reason) { setRowError(messageOf(reason, fallback)); }
    finally { setBusyIds(current => current.filter(id => id !== alert.id)); }
  };

  const togglePaused = (alert: SeekerAlert) => runRowAction(alert, async () => {
    const result = await setSeekerAlertPaused(alert.id, !alert.paused, getToken);
    updateList(current => current.map(item => (item.id === result.id ? { ...item, paused: result.paused } : item)));
  }, ALERT_UPDATE_ERROR);

  const remove = (alert: SeekerAlert) => runRowAction(alert, async () => {
    const removedId = await deleteSeekerAlert(alert.id, getToken);
    updateList(current => current.filter(item => item.id !== removedId));
  }, ALERT_REMOVE_ERROR);

  const cancel = () => { setAdding(false); setDomain(""); setFormError(""); };
  const loading = alerts.isFetching && !alerts.data;
  const loadError = alerts.isError && !alerts.isFetching ? alerts.error.message : "";
  // Same wording and fallback as the backend's cap: no readable paid plan counts as Free.
  const capNote = !alerts.data || plan.isPending ? "" : (plan.data ?? "free") === "free" ? `Free accounts keep ${FREE_ALERT_LIMIT} alerts (${alerts.data.length} used).` : "Your plan allows unlimited alerts.";

  return (
    <div className="mt-4 space-y-3" data-skipwait-saved-alerts="live">
      {loading ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your saved alerts…</p> : null}
      {loadError ? (
        <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {loadError} <button type="button" className="font-semibold underline" onClick={() => { void alerts.refetch(); }}>Try again</button>
        </div>
      ) : null}
      {rowError ? <p role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{rowError}</p> : null}

      {alerts.data && alerts.data.length === 0 ? (
        <Panel tone="muted" className="text-center">
          <Search className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">Get told when a door opens.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick a company. We&apos;ll alert you when a verified referrer there becomes available.</p>
        </Panel>
      ) : null}

      {alerts.data && alerts.data.length > 0 ? (
        <ul className="space-y-3" aria-label="Watched companies">
          {alerts.data.map(alert => {
            const busy = busyIds.includes(alert.id);
            return (
              <li key={alert.id}>
                <Panel className="flex items-center gap-3 p-4!">
                  <span className="company-mark" aria-hidden="true">{domainInitials(alert.companyDomain)}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate">{alert.companyDomain}</strong><small className="text-muted-foreground">{alertStatus(alert)}</small></span>
                  <Button variant="ghost" size="icon" className="size-11 md:size-9" disabled={busy} aria-label={alert.paused ? `Resume alert for ${alert.companyDomain}` : `Pause alert for ${alert.companyDomain}`} onClick={() => { void togglePaused(alert); }}>{alert.paused ? <BellOff /> : <Bell />}</Button>
                  <Button variant="ghost" size="icon" className="size-11 md:size-9" disabled={busy} aria-label={`Delete alert for ${alert.companyDomain}`} onClick={() => { void remove(alert); }}><Trash2 /></Button>
                </Panel>
              </li>
            );
          })}
        </ul>
      ) : null}

      {alerts.data && adding ? (
        <Panel>
          <form onSubmit={event => { void submit(event); }} noValidate>
            <label className="block text-sm font-medium">Company domain
              <input className={field} value={domain} onChange={event => setDomain(event.target.value)} placeholder="acme.com" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus aria-describedby={formError ? "saved-alert-error" : undefined} />
            </label>
            {formError ? <p id="saved-alert-error" role="alert" className="mt-3 text-sm text-destructive">{formError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
              <Button type="submit" disabled={saving || !domain.trim()}>{saving ? "Saving…" : "Save alert"}</Button>
            </div>
          </form>
        </Panel>
      ) : null}
      {alerts.data && !adding ? <Button variant="outline" className="w-full" onClick={() => setAdding(true)}><Plus />New alert</Button> : null}
      {capNote ? <p className="text-center text-xs text-muted-foreground">{capNote}</p> : null}
    </div>
  );
}
