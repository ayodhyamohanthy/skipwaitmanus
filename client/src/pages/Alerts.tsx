import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { NotificationGroups } from "@/components/alerts/NotificationGroups";
import { SavedAlerts } from "@/components/alerts/SavedAlerts";
import { notificationListSchema, orderNotifications, type NotificationItem } from "@/components/alerts/notifications";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

const TABS = ["Notifications", "Saved alerts"] as const;
const FILTERS = ["All", "Unread"] as const;
const LOAD_ERROR = "We could not load your alerts";
const NETWORK_ERROR = "We could not reach SkipWait. Check your connection and try again.";
const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me"];
const HEADING = { eyebrow: "STAY IN THE LOOP", title: "Alerts", text: "Only things that need you. No marketing, no “you might like”." } as const;

export default function Alerts() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Notifications");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const queryKey = ["alerts", "notifications", userId ?? "session"] as const;

  const notifications = useQuery({
    queryKey,
    enabled: isSignedIn,
    retry: false,
    queryFn: async (): Promise<NotificationItem[]> => {
      const token = await fetchToken();
      let response: Response;
      try {
        response = await fetch("/api/notifications", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      } catch { throw new Error(NETWORK_ERROR); }
      const payload = await readApiJson<Record<string, unknown>>(response, LOAD_ERROR);
      if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : LOAD_ERROR);
      const parsed = notificationListSchema.safeParse(payload);
      if (!parsed.success) throw new Error(LOAD_ERROR);
      return parsed.data.notifications;
    },
  });

  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses?.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && domain && !PERSONAL_DOMAINS.includes(domain);
  }));
  const destinationFor = (item: NotificationItem) =>
    item.category === "status" ? "/requests" : item.category === "system" ? "/settings" : hasVerifiedWorkEmail ? "/inbox" : "/requests";

  const stampRead = (ids: readonly number[]) => {
    if (!ids.length) return;
    const stamped = new Date().toISOString();
    queryClient.setQueryData<NotificationItem[]>(queryKey, current => current?.map(item => ids.includes(item.id) && !item.readAt ? { ...item, readAt: stamped } : item));
  };

  // Resolves true only when the server confirmed the read; never throws.
  const postRead = async (item: NotificationItem) => {
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/notifications/${item.id}/read`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return response.ok;
    } catch { return false; }
  };

  const openNotification = async (item: NotificationItem) => {
    if (openingId !== null) return;
    setOpeningId(item.id);
    try {
      // A failed read stays unread and is retried the next time it is opened.
      if (!item.readAt && await postRead(item)) stampRead([item.id]);
      go(destinationFor(item));
    } finally { setOpeningId(null); }
  };

  const markAllRead = async () => {
    const unreadItems = (notifications.data ?? []).filter(item => !item.readAt);
    if (!unreadItems.length || openingId !== null) return;
    setOpeningId(-1);
    setActionNotice("");
    try {
      const results = await Promise.all(unreadItems.map(async item => (await postRead(item) ? item.id : null)));
      const confirmed = results.filter((id): id is number => id !== null);
      stampRead(confirmed);
      if (confirmed.length < unreadItems.length) setActionNotice("Some alerts could not be marked read. Try again.");
    } finally { setOpeningId(null); }
  };

  const ordered = useMemo(() => orderNotifications(notifications.data ?? []), [notifications.data]);
  const shown = filter === "All" ? ordered : ordered.filter(item => !item.readAt);
  const unread = ordered.filter(item => !item.readAt).length;
  const loading = isSignedIn && notifications.isFetching && !notifications.data;
  const loadError = notifications.isError && !notifications.isFetching ? notifications.error.message : "";

  if (!isLoaded) {
    return <main data-skipwait-screen="alerts" className="page-content"><Heading {...HEADING} /><p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your alerts…</p></main>;
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="alerts-sign-in" className="page-content">
        <Heading {...HEADING} />
        <Panel tone="muted" className="mt-7 text-center">
          <Bell className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">Alerts need you signed in.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Replies, accepted asks and credit updates land here once you sign in.</p>
          <SignInButton className={buttonVariants({ className: "mt-4" })}>Sign in</SignInButton>
        </Panel>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="alerts" className="page-content">
      <Heading {...HEADING} />
      <div className="directory-tabs section-tabs" role="tablist" aria-label="Alerts">
        {TABS.map(value => (
          <Button key={value} variant="ghost" role="tab" aria-selected={tab === value} className={tab === value ? "selected" : ""} onClick={() => setTab(value)}>
            {value}
            {value === "Notifications" && unread > 0 ? <><span aria-hidden="true" className="ml-1 rounded-full bg-primary px-2 text-xs text-primary-foreground">{unread}</span><span className="sr-only">, {unread} unread</span></> : null}
          </Button>
        ))}
      </div>

      {tab === "Notifications" ? (
        <div role="tabpanel" aria-label="Notifications">
          <div className="my-4 flex items-center justify-between gap-2">
            <div className="flex rounded-full bg-muted p-1 text-sm" role="group" aria-label="Show">
              {FILTERS.map(value => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-full px-4 md:min-h-9 ${filter === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{value}</button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="min-h-11 md:min-h-8" disabled={!unread || openingId !== null} onClick={() => { void markAllRead(); }}><CheckCheck />Mark all read</Button>
          </div>

          {actionNotice ? <p role="status" className="mb-4 text-sm text-muted-foreground">{actionNotice}</p> : null}
          {loading ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your alerts…</p> : null}
          {loadError ? (
            <div role="alert" className="mb-4 rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              {loadError} <button type="button" className="font-semibold underline" onClick={() => { void notifications.refetch(); }}>Try again</button>
            </div>
          ) : null}

          {notifications.data && shown.length === 0 ? (
            <Panel tone="muted" className="text-center">
              <BellOff className="mx-auto mb-3 size-8" />
              <h2 className="text-lg font-semibold">{filter === "Unread" && ordered.length > 0 ? "You're all caught up." : "No notifications yet."}</h2>
              <p className="mt-1 text-sm text-muted-foreground">When a referrer replies or a new one opens at a company you&apos;re waiting on, it lands here.</p>
              <Button asChild className="mt-4"><Link href="/explore">Explore companies</Link></Button>
            </Panel>
          ) : null}

          <NotificationGroups items={shown} onOpen={item => { void openNotification(item); }} />
          <p className="mt-4 text-center text-sm text-muted-foreground"><Link href="/settings" className="text-link">Choose what notifies you</Link></p>
        </div>
      ) : <div role="tabpanel" aria-label="Saved alerts"><SavedAlerts userId={userId} getToken={fetchToken} /></div>}
    </main>
  );
}
