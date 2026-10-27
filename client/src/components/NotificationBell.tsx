import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { readApiJson } from "@/lib/apiResponse";

type NotificationPreview = { id: number; readAt: string | null };
type NotificationResponse = { notifications?: NotificationPreview[]; error?: string };

// One in-flight request shared by every bell on the page (the menu renders more than once).
let inFlight: { token: string | null; at: number; promise: Promise<number> } | null = null;
async function loadUnread(getToken: () => Promise<string | null>): Promise<number> {
  const token = await getToken();
  if (inFlight && inFlight.token === token) return inFlight.promise;
  const promise = (async () => {
    const response = await fetch("/api/notifications", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const payload = await readApiJson<NotificationResponse>(response, "Your private updates are unavailable right now.");
    if (!response.ok) throw new Error(payload.error || "Your private updates are unavailable right now.");
    return (payload.notifications || []).filter(notification => !notification.readAt).length;
  })();
  inFlight = { token, at: Date.now(), promise };
  const clear = () => { if (inFlight?.promise === promise) inFlight = null; };
  promise.then(clear, clear);
  return promise;
}

export function NotificationBell() {
  const { isSignedIn, getToken } = useAuth();
  const [, go] = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isSignedIn) { setUnreadCount(0); return; }
    let active = true;
    void (async () => {
      try {
        const unread = await loadUnread(getToken);
        if (active) setUnreadCount(unread);
      } catch { if (active) setUnreadCount(0); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return null;
  const countLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  // Goal system (D-048-F-shell-parts): the shell's icon-button geometry, and an
  // ink unread badge - the moved goal surfaces mark "needs you" with ink
  // (GoalAlerts), while trust blue and the status hues stay reserved inside
  // components/goal (rules R2/R3 in scripts/designTokenAuditCore.mjs).
  return (
    <button
      type="button"
      data-skipwait-notification-bell="true"
      onClick={() => go("/notifications")}
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
      title="Notifications"
      className="g-hit relative grid size-9 place-items-center rounded-g-control text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink max-gdesk:size-11"
    >
      <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
      {unreadCount ? (
        <span
          data-skipwait-notification-count={String(unreadCount)}
          aria-hidden="true"
          className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-g-ink px-1 font-g-mono text-[10px] font-medium leading-none tracking-normal text-g-on-primary"
        >
          {countLabel}
        </span>
      ) : null}
    </button>
  );
}
