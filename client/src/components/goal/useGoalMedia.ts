import { useEffect, useState } from "react";

/** The goal UI's single breakpoint (DESIGN.md Layout): desktop at 641px and wider, phone below. */
export const GOAL_DESKTOP_QUERY = "(min-width: 641px)";

function readDesktop(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(GOAL_DESKTOP_QUERY).matches;
}

/** True on desktop. Without matchMedia (prerender, jsdom) it reads as desktop. */
export function useGoalDesktop(): boolean {
  const [desktop, setDesktop] = useState(readDesktop);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(GOAL_DESKTOP_QUERY);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return desktop;
}

/** Online state from the same window events as the app-wide offline banner (`PwaStatus.tsx`). Screens use it only to
 * disable network actions with a reason; the banner itself already exists, so no second one is drawn. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
