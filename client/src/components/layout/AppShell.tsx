/**
 * src/components/layout/AppShell.tsx
 * skipwait.me Kinetic · Adaptive App Shell
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { cx, SvgIcon, type IconProps } from "../ui/primitives";

export type ShellMode = "seeking" | "giving";
export interface NavDestination { id: string; label: string; railLabel: string; href: string; affinity: ShellMode | "shared"; }

const DESTINATIONS: readonly NavDestination[] = [
  { id: "insiders", label: "Find Insiders", railLabel: "Insiders", href: "/insiders", affinity: "seeking" },
  { id: "pipeline", label: "Pipeline", railLabel: "Pipeline", href: "/pipeline", affinity: "shared" },
  { id: "cockpit", label: "Referrer Cockpit", railLabel: "Cockpit", href: "/cockpit", affinity: "giving" },
];

const ShellModeContext = createContext<{ mode: ShellMode; setMode: (m: ShellMode) => void } | null>(null);
export function useShellMode() {
  const ctx = useContext(ShellModeContext);
  if (!ctx) throw new Error("useShellMode must be used within AppShell");
  return ctx;
}

export function AppShell({ children, currentPath, onNavigate }: { children: ReactNode; currentPath: string; onNavigate: (href: string) => void }) {
  const [mode, setMode] = useState<ShellMode>("seeking");

  return (
    <ShellModeContext.Provider value={{ mode, setMode }}>
      <div className="min-h-dvh bg-canvas text-ink-body">
        <header className="sticky top-0 z-30 border-b border-hairline bg-surface px-8 h-16 flex items-center justify-between">
          <div className="flex gap-2 bg-surface-sunken p-1 rounded-full">
            <button onClick={() => setMode("seeking")} className={cx("px-4 py-1.5 rounded-full text-label-ui", mode === "seeking" ? "bg-surface font-semibold text-ink shadow-segment" : "text-ink-muted")}>Seeking Intro</button>
            <button onClick={() => setMode("giving")} className={cx("px-4 py-1.5 rounded-full text-label-ui", mode === "giving" ? "bg-surface font-semibold text-ink shadow-segment" : "text-ink-muted")}>Giving Referrals</button>
          </div>
        </header>
        <main className="max-w-[1120px] mx-auto px-8 py-8">{children}</main>
        <nav className="fixed bottom-0 inset-x-0 border-t border-hairline bg-surface md:hidden flex justify-around h-16 items-center">
          {DESTINATIONS.map((d) => (
            <button key={d.id} onClick={() => onNavigate(d.href)} className={cx("text-label-ui", currentPath === d.href ? "text-ink font-semibold" : "text-ink-muted")}>{d.railLabel}</button>
          ))}
        </nav>
      </div>
    </ShellModeContext.Provider>
  );
}