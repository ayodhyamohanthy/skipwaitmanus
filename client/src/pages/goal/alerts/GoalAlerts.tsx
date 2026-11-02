import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalFilterChip, GoalListSection, GoalNum } from "@/components/goal";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { SavedAlerts } from "@/components/alerts/SavedAlerts";
import { notificationListSchema, orderNotifications, timeAgo, type NotificationItem } from "@/components/alerts/notifications";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";

const LOAD_ERROR = "We could not load your alerts";
const NETWORK_ERROR = "We could not reach skipwait.me. Check your connection and try again.";

/** One alert row: filled dot + "Unread" words while it needs you, ringed after. */
function AlertRow({ item, busy, onOpen }: { item: NotificationItem; busy: boolean; onOpen: () => void }) {
  const unread = !item.readAt;
  return (
    <li data-testid="goal-list-row">
      <button type="button" disabled={busy} onClick={onOpen}
        aria-label={`${item.title}${unread ? ", unread" : ""}`}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover">
        <span aria-hidden="true" className={`row-span-2 size-(--g-dot) rounded-full ${unread ? "bg-g-ink" : "border-[1.5px] border-g-control-edge"}`} />
        <span className="min-w-0 truncate text-g-label text-g-ink">{item.title}</span>
        <span className="justify-self-end whitespace-nowrap text-g-meta text-g-ink-3"><GoalNum>{timeAgo(item.createdAt)}</GoalNum></span>
        <span className="col-span-2 min-w-0 truncate text-g-meta text-g-ink-2">{unread ? "Unread · " : ""}{item.body}</span>
      </button>
    </li>
  );
}

export default function GoalAlerts() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [view, setView] = useState<"notifications" | "saved">("notifications");
  const [filter, setFilter] = useState<"All" | "Unread">("All");
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

  // Same routing rule as the kit: the server's verified-referrer verdict decides
  // whether referral/message alerts open /inbox or the seeker's /requests.
  const access = useReferrerAccess();
  const destinationFor = (item: NotificationItem) =>
    item.category === "status" ? "/requests" : item.category === "system" ? "/settings" : access.status === "unverified" ? "/requests" : "/inbox";

  const stampRead = (ids: readonly number[]) => {
    if (!ids.length) return;
    const stamped = new Date().toISOString();
    queryClient.setQueryData<NotificationItem[]>(queryKey, current => current?.map(item => ids.includes(item.id) && !item.readAt ? { ...item, readAt: stamped } : item));
  };

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
  const unreadItems = ordered.filter(item => !item.readAt);
  const earlier = shown.filter(item => item.readAt);
  const needsYou = shown.filter(item => !item.readAt);
  const markAllIdle = !unreadItems.length || openingId !== null;
  const loading = isSignedIn && notifications.isFetching && !notifications.data;
  const loadError = notifications.isError && !notifications.isFetching ? notifications.error.message : "";
  const next = unreadItems[0] ?? null;

  if (!isLoaded) {
    return <main data-skipwait-screen="alerts" className="g-scope page-content mx-auto w-full max-w-2xl"><LoadingNote>Loading your alerts…</LoadingNote></main>;
  }

  if (!isSignedIn) {
    return <main data-skipwait-screen="alerts-sign-in" data-testid="goal-alerts" className="g-scope page-content mx-auto w-full max-w-2xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">See what needs you.</h1>
        <p className="mt-2 text-g-meta text-g-ink-2">Replies, accepted referral requests and allowance updates land here once you sign in.</p>
      </header>
      <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <div className="mt-4"><SignInButton><GoalButton variant="primary" asChild><button type="button">Sign in</button></GoalButton></SignInButton></div>
      </section>
    </main>;
  }

  return <main data-skipwait-screen="alerts" data-testid="goal-alerts" className="g-scope page-content mx-auto w-full max-w-2xl pb-10">
    <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
      <h1 className="text-g-display text-g-ink">See what needs you.</h1>
      <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
        <span aria-hidden="true" className={`size-(--g-dot) shrink-0 rounded-full ${loadError ? "bg-g-crimson" : "bg-g-ink"}`} />
        <span>{loadError ? loadError : loading ? "Loading your alerts…" : unreadItems.length ? <><GoalNum>{unreadItems.length}</GoalNum> unread.</> : "You are all caught up."} Only things that need you. No marketing.</span>
        {loadError ? <button type="button" className="text-g-ink underline underline-offset-[3px]" onClick={() => { void notifications.refetch(); }}>Try again</button> : null}</p>
    </header>

    <div className="mt-4 flex flex-wrap items-center gap-2 px-4 gdesk:px-5" role="group" aria-label="Alerts view">
      <GoalFilterChip label="Notifications" pressed={view === "notifications"} onPressedChange={() => setView("notifications")} count={unreadItems.length || undefined} />
      <GoalFilterChip label="Saved alerts" pressed={view === "saved"} onPressedChange={() => setView("saved")} />
    </div>

    {view === "saved" ? <div className="mt-4 px-4 gdesk:px-5"><SavedAlerts userId={userId} getToken={fetchToken} /></div> : <>
      {next ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <p className="mt-2 text-g-label text-g-ink">{next.title}</p>
        <p className="mt-1 truncate text-g-meta text-g-ink-2">{next.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <GoalButton variant="primary" busy={openingId === next.id} onClick={() => { void openNotification(next); }}>Open it</GoalButton>
          <button type="button" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink" aria-disabled={markAllIdle || undefined}
            onClick={() => { if (!markAllIdle) void markAllRead(); }}>Mark all read</button>
        </div>
      </section> : null}

      {actionNotice ? <p role="status" className="mx-4 mb-3 text-g-meta text-g-ink-2 gdesk:mx-5">{actionNotice}</p> : null}

      <div className="mb-2 flex flex-wrap items-center gap-2 px-4 gdesk:px-5" role="group" aria-label="Show">
        <GoalFilterChip label="All" pressed={filter === "All"} onPressedChange={() => setFilter("All")} />
        <GoalFilterChip label="Unread" pressed={filter === "Unread"} onPressedChange={() => setFilter("Unread")} count={unreadItems.length || undefined} />
      </div>

      {notifications.data && !next ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">{ordered.length > 0 ? "You are all caught up." : "No notifications yet."}</h2>
        <p className="mt-2 text-g-meta text-g-ink-2">When a referrer replies or a new one opens at your alert companies, it lands here.</p>
        <div className="mt-4"><GoalButton variant="primary" asChild><Link href="/explore">Explore companies</Link></GoalButton></div>
      </section> : null}

      {needsYou.length ? <div className="mx-4 gdesk:mx-5"><GoalListSection label="Needs you" count={needsYou.length}>
        <ul>{needsYou.map(item => <AlertRow key={item.id} item={item} busy={openingId !== null} onOpen={() => { void openNotification(item); }} />)}</ul>
      </GoalListSection></div> : null}
      {earlier.length ? <div className="mx-4 gdesk:mx-5"><GoalListSection label="Earlier" count={earlier.length}>
        <ul>{earlier.map(item => <AlertRow key={item.id} item={item} busy={openingId !== null} onOpen={() => { void openNotification(item); }} />)}</ul>
      </GoalListSection></div> : null}

      <p className="mt-4 px-4 text-g-meta text-g-ink-3 gdesk:px-5"><Link href="/settings" className="text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Choose what notifies you</Link></p>
    </>}
  </main>;
}
