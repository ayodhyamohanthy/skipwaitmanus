import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { readApiJson } from "@/lib/apiResponse";

type NotificationPreview = { id: number; readAt: string | null };
type NotificationResponse = { notifications?: NotificationPreview[]; error?: string };

export function NotificationBell() {
  const { isSignedIn, getToken } = useClerkAuth();
  const [, go] = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isSignedIn) { setUnreadCount(0); return; }
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/notifications", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<NotificationResponse>(response, "Your private updates are unavailable right now.");
        if (!response.ok) throw new Error(payload.error || "Your private updates are unavailable right now.");
        if (active) setUnreadCount((payload.notifications || []).filter(notification => !notification.readAt).length);
      } catch { if (active) setUnreadCount(0); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return null;
  const countLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  return <button type="button" data-skipwait-notification-bell="true" onClick={() => go("/notifications")} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} title="Notifications" className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-[#0B57D0] focus:outline-none focus:ring-2 focus:ring-[#0B57D0] focus:ring-offset-2"><Bell className="h-4 w-4" />{unreadCount ? <span data-skipwait-notification-count={String(unreadCount)} aria-hidden="true" className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold leading-none text-white">{countLabel}</span> : null}</button>;
}
