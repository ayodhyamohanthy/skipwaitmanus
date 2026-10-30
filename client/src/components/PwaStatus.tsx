import { useEffect, useState } from "react";
import { Signal, WifiOff } from "lucide-react";
import { StatusBanner } from "@/components/app-states/SystemStates";
import { Toaster } from "@/components/ui/sonner";
// Relative on purpose: the goal wrapper variants live with the goal primitives
// (D-048-F-app-wrapper) and render only where the route's goal surface is on.
import { GoalNotice } from "./goal/wrapper/GoalNotice";
import { GOAL_TOASTER_PROPS } from "./goal/wrapper/goalToaster";
import { useGoalWrapperOn } from "./goal/wrapper/routeSurface";

export const SW_UPDATE_EVENT = "skipwait:sw-update";

/**
 * A new deploy's worker is installed and waiting. Activate it quietly: no banner, no reload. The page the person is on
 * keeps running; the next navigation picks up the new version. (Navigations are network-first, so nothing stale is served.)
 */
export function PwaUpdatePrompt() {
  useEffect(() => {
    const onUpdate = (event: Event) => { (event as CustomEvent<ServiceWorker>).detail?.postMessage({ type: "SKIP_WAITING" }); };
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);
  return null;
}

type NetworkInformation = { effectiveType?: string; saveData?: boolean; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void };
const connection = (): NetworkInformation | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { connection?: NetworkInformation }).connection);
export const isSlowConnection = (c: NetworkInformation | undefined) => Boolean(c && (c.effectiveType === "slow-2g" || c.effectiveType === "2g"));

/** Kit "Slow connection" state. Only claims what is true: the device reports a 2G-class link. */
export function SlowConnectionNotice() {
  const goal = useGoalWrapperOn();
  const [slow, setSlow] = useState(() => isSlowConnection(connection()));
  useEffect(() => {
    const c = connection();
    if (!c?.addEventListener) return;
    const update = () => setSlow(isSlowConnection(c));
    c.addEventListener("change", update);
    return () => c.removeEventListener?.("change", update);
  }, []);
  if (!slow || (typeof navigator !== "undefined" && !navigator.onLine)) return null;
  if (goal) return <GoalNotice icon={<Signal className="size-4 shrink-0" aria-hidden="true" />}>Slow connection. Pages may take a moment to load.</GoalNotice>;
  return <StatusBanner icon={<Signal className="size-4 shrink-0" aria-hidden="true" />}>Slow connection. Pages may take a moment to load.</StatusBanner>;
}

/** Kit "Offline" banner. Hidden on /offline, which carries the same banner itself. */
export function OfflineNotice() {
  const goal = useGoalWrapperOn();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const restore = () => setOnline(true);
    const lose = () => setOnline(false);
    window.addEventListener("online", restore);
    window.addEventListener("offline", lose);
    return () => { window.removeEventListener("online", restore); window.removeEventListener("offline", lose); };
  }, []);
  if (online || (typeof window !== "undefined" && window.location.pathname === "/offline")) return null;
  if (goal) return <GoalNotice icon={<WifiOff className="size-4 shrink-0" aria-hidden="true" />}>You&apos;re offline. Showing saved info.</GoalNotice>;
  return <StatusBanner icon={<WifiOff className="size-4 shrink-0" aria-hidden="true" />}>You&apos;re offline. Showing saved info.</StatusBanner>;
}

/**
 * The one app-wide toaster. It stays mounted for the app's whole life, so a toast fired just before a
 * navigation survives it; on a goal route the same instance takes the goal styling (D-048-F-app-wrapper).
 */
export function AppToaster() {
  const goal = useGoalWrapperOn();
  return <Toaster position="top-center" offset={{ top: "72px" }} mobileOffset={{ top: "72px" }} {...(goal ? GOAL_TOASTER_PROPS : {})} />;
}
