import { Bell, BellOff, BriefcaseBusiness, CheckCheck, CheckCircle2, CircleDollarSign, MessageCircle, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type NotificationCategory = "referral" | "message" | "status" | "system";
type NotificationItem = { id: number; category: NotificationCategory; title: string; body: string; readAt: string | null; createdAt: string };
type SeekerAlertItem = { id: number; companyDomain: string; paused: boolean; notifiedAt: string | null; createdAt: string };

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days`;
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function NotificationIcon({ category }: { category: NotificationCategory }) {
  const className = "size-5";
  if (category === "referral") return <BriefcaseBusiness className={className} />;
  if (category === "message") return <MessageCircle className={className} />;
  if (category === "status") return <CheckCircle2 className={className} />;
  if (category === "system") return <CircleDollarSign className={className} />;
  return <Bell className={className} />;
}

export default function Alerts() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [tab, setTab] = useState<"notifications" | "saved">("notifications");
  const [alerts, setAlerts] = useState<SeekerAlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertError, setAlertError] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [addingAlert, setAddingAlert] = useState(false);
  const [plan, setPlan] = useState("free");

  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses?.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me"].includes(domain);
  }));

  const destinationFor = (item: NotificationItem) =>
    item.category === "status" ? "/requests" : item.category === "system" ? "/settings" : hasVerifiedWorkEmail ? "/inbox" : "/requests";

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/notifications", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ notifications?: NotificationItem[]; error?: string }>(response, "We could not load your alerts");
      if (!response.ok) throw new Error(payload.error || "We could not load your alerts");
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your alerts"); }
    finally { setLoading(false); }
  };

  const loadAlerts = async () => {
    if (!isSignedIn) return;
    setAlertsLoading(true); setAlertError("");
    try {
      const token = await fetchToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [alertsResponse, creditsResponse] = await Promise.all([
        fetch("/api/seeker-alerts", { credentials: "include", headers }),
        fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers }),
      ]);
      const alertsPayload = await readApiJson<{ alerts?: SeekerAlertItem[]; error?: string }>(alertsResponse, "We could not load your saved alerts");
      if (!alertsResponse.ok) throw new Error(alertsPayload.error || "We could not load your saved alerts");
      setAlerts(Array.isArray(alertsPayload.alerts) ? alertsPayload.alerts : []);
      if (creditsResponse.ok) {
        const creditsPayload = await readApiJson<{ summary?: { plan?: string } }>(creditsResponse, "");
        if (typeof creditsPayload.summary?.plan === "string") setPlan(creditsPayload.summary.plan);
      }
    } catch (reason) { setAlertError(reason instanceof Error ? reason.message : "We could not load your saved alerts"); }
    finally { setAlertsLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);
  useEffect(() => { if (tab === "saved") void loadAlerts(); }, [tab, fetchToken, isSignedIn]);

  const addAlert = async () => {
    const domain = newDomain.trim();
    if (!domain || addingAlert) return;
    setAddingAlert(true); setAlertError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/seeker-alerts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyDomain: domain }) });
      const payload = await readApiJson<{ alert?: SeekerAlertItem; error?: string }>(response, "We could not save this alert");
      if (!response.ok || !payload.alert) throw new Error(payload.error || "We could not save this alert");
      setAlerts(current => [payload.alert as SeekerAlertItem, ...current]);
      setNewDomain("");
    } catch (reason) { setAlertError(reason instanceof Error ? reason.message : "We could not save this alert"); }
    finally { setAddingAlert(false); }
  };

  const toggleAlertPaused = async (alert: SeekerAlertItem) => {
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/seeker-alerts/${alert.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ paused: !alert.paused }) });
      const payload = await readApiJson<{ alert?: SeekerAlertItem; error?: string }>(response, "We could not update this alert");
      if (!response.ok || !payload.alert) throw new Error(payload.error || "We could not update this alert");
      setAlerts(current => current.map(item => item.id === alert.id ? { ...item, paused: Boolean(payload.alert?.paused) } : item));
    } catch (reason) { setAlertError(reason instanceof Error ? reason.message : "We could not update this alert"); }
  };

  const removeAlert = async (alert: SeekerAlertItem) => {
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/seeker-alerts/${alert.id}`, { method: "DELETE", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        const payload = await readApiJson<{ error?: string }>(response, "We could not remove this alert");
        throw new Error(payload.error || "We could not remove this alert");
      }
      setAlerts(current => current.filter(item => item.id !== alert.id));
    } catch (reason) { setAlertError(reason instanceof Error ? reason.message : "We could not remove this alert"); }
  };

  const markRead = async (id: number) => {
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) return;
      setNotifications(current => current.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch { /* stays unread; retry on next open */ }
  };

  const openNotification = async (item: NotificationItem) => {
    if (openingId !== null) return;
    setOpeningId(item.id);
    try {
      if (!item.readAt) await markRead(item.id);
      go(destinationFor(item));
    } finally { setOpeningId(null); }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(item => !item.readAt);
    if (!unread.length) return;
    setOpeningId(-1);
    try {
      const token = await fetchToken();
      await Promise.all(unread.map(item => fetch(`/api/notifications/${item.id}/read`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined)));
      const stamped = new Date().toISOString();
      setNotifications(current => current.map(item => item.readAt ? item : { ...item, readAt: stamped }));
    } finally { setOpeningId(null); }
  };

  const ordered = useMemo(() => [...notifications].sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [notifications]);
  const shown = filter === "all" ? ordered : ordered.filter(item => !item.readAt);
  const unread = notifications.filter(item => !item.readAt).length;

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="alerts-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Stay in the loop</p>
        <h1 className="mt-2 text-3xl font-semibold">Alerts need you signed in.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Only things that need you. No marketing, no “you might like”.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="alerts" className="page-content">
      <div className="mb-2"><span className="eyebrow">Stay in the loop</span><h1 className="mt-2 text-4xl font-semibold">Alerts<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Only things that need you. No marketing, no “you might like”.</p></div>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Alert views">
        {(["notifications", "saved"] as const).map(value => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 rounded-full border px-4 text-sm ${tab === value ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{value === "notifications" ? `Notifications${unread > 0 ? ` (${unread})` : ""}` : "Saved alerts"}</button>
        ))}
      </div>

      {tab === "saved" ? (
        <section aria-label="Saved alerts" className="mt-4">
          <p className="text-sm text-[var(--muted-foreground)]">Watch a company. The moment a verified referrer there opens up, you hear first. {plan === "free" ? `Free accounts keep 3 alerts (${alerts.length} used).` : "Your plan allows unlimited alerts."}</p>
          <form onSubmit={event => { event.preventDefault(); void addAlert(); }} className="mt-4 flex gap-2">
            <label className="min-w-0 flex-1"><span className="sr-only">Company domain to watch</span>
              <input value={newDomain} onChange={event => setNewDomain(event.target.value)} placeholder="acme.com" inputMode="url" autoComplete="off" className="h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
            </label>
            <button type="submit" disabled={addingAlert || !newDomain.trim()} className="brand-button shrink-0"><Plus />{addingAlert ? "Adding…" : "New alert"}</button>
          </form>
          {alertError ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{alertError} <button type="button" className="font-bold underline" onClick={() => { void loadAlerts(); }}>Try again</button></p> : null}
          {alertsLoading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your saved alerts…</p> : null}
          {!alertsLoading && !alertError && alerts.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
              <Bell className="mx-auto mb-3 size-8" />
              <h2 className="text-lg font-semibold">No saved alerts yet.</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Watch a company above and we will tell you when someone inside can refer.</p>
            </div>
          ) : null}
          {!alertsLoading && alerts.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {alerts.map(alert => (
                <li key={alert.id} className="flex items-center gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--muted)]"><Bell className="size-5" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{alert.companyDomain}</strong><span className="block text-xs text-[var(--muted-foreground)]">{alert.paused ? "Paused" : alert.notifiedAt ? "Notified — door open" : "Watching · instant"}</span></span>
                  <button type="button" onClick={() => { void toggleAlertPaused(alert); }} aria-label={alert.paused ? `Resume alert for ${alert.companyDomain}` : `Pause alert for ${alert.companyDomain}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)]">{alert.paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
                  <button type="button" onClick={() => { void removeAlert(alert); }} aria-label={`Delete alert for ${alert.companyDomain}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)] text-[var(--destructive)]"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
      <>
      <div className="my-4 flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-[var(--muted)] p-1 text-sm" role="tablist" aria-label="Alert filter">
          {(["all", "unread"] as const).map(value => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-full px-4 capitalize ${filter === value ? "bg-[var(--background)] font-semibold shadow-sm" : "text-[var(--muted-foreground)]"}`}>
              {value}{value === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        <button type="button" disabled={!unread || openingId !== null} onClick={() => { void markAllRead(); }} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"><CheckCheck className="size-4" />Mark all read</button>
      </div>

      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your alerts…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error} <button type="button" className="font-bold underline" onClick={() => { void load(); }}>Try again</button></p> : null}

      {!loading && !error && shown.length === 0 ? (
        <section className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
          <BellOff className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">{filter === "unread" && notifications.length > 0 ? "You're all caught up." : "No notifications yet."}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">When a referrer replies or a new one opens at a company you follow, it lands here.</p>
          <Link href="/explore" className="brand-button mt-4">Explore companies</Link>
        </section>
      ) : null}

      {(["Today", "Earlier"] as const).map(group => {
        const items = shown.filter(item => (group === "Today") === isToday(item.createdAt));
        if (!items.length) return null;
        return (
          <div key={group} className="mb-4">
            <h2 className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">{group.toUpperCase()}</h2>
            <ul className="overflow-hidden rounded-3xl border border-[var(--border)]">
              {items.map(item => (
                <li key={item.id} className="border-b border-[var(--border)] last:border-0">
                  <button
                    type="button"
                    onClick={() => { void openNotification(item); }}
                    className={`flex min-h-16 w-full items-start gap-3 p-4 text-left ${!item.readAt ? "bg-[var(--primary)]/5" : ""}`}
                    aria-label={`${item.title}${!item.readAt ? ", unread" : ""}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--muted)]"><NotificationIcon category={item.category} /></span>
                    <span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong><span className="block truncate text-sm text-[var(--muted-foreground)]">{item.body}</span></span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{timeAgo(item.createdAt)}</span>
                    {!item.readAt ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--primary)]" aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      </>
      )}
      <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]"><Link href="/settings" className="text-link">Choose what notifies you</Link></p>
    </main>
  );
}
