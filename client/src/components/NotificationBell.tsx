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
  return <button type="button" data-skipwait-notification-bell="true" onClick={() => go("/notifications")} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} title="Notifications" className="relative grid h-9 w-9 place-items-center rounded-full border border-[#e5e5e5] bg-white text-[#505050] transition hover:border-[#141414] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#141414] focus:ring-offset-2"><Bell className="h-4 w-4" />{unreadCount ? <span data-skipwait-notification-count={String(unreadCount)} aria-hidden="true" className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#B91C1C] px-1 text-[9px] font-extrabold leading-none text-white">{countLabel}</span> : null}</button>;
}
