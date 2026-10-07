import { SignInButton, useAuth } from "@/_core/auth";
import { ArrowUpRight, Bell, Briefcase, Building2, Crown, Inbox, ListChecks, Menu, Settings as SettingsIcon, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";

/**
 * Shared app shell (Batch 1 foundation — not yet wired into App.tsx).
 *
 * Kit behavior (FOR_AI_BUILDERS.md section 7 navigation) on live DESIGN.md
 * tokens: desktop sidebar + mobile bottom tab bar, safe-area insets, More
 * menu, notifications bell. Destinations are LIVE routes; kit-only routes
 * (/explore, /profile, /work, /help, /for-companies, /alerts) swap in with
 * their screen batches. Deliberate deviations from skipwait-shell.tsx:
 * - 5 mobile tabs (kit ships 8 cramped columns); account links live in More.
 * - Active item = pale-blue selected state (live language), not blue fill.
 * - More is an inline disclosure on desktop, drawer section on mobile.
 * - Bell links to /notifications (no unread fetch in the shell yet).
 *
 * Not wired yet on purpose: live task pages are self-contained h-dvh
 * layouts with their own headers; each screen batch converts its page to
 * shell-compatible layout and opts into this shell.
 */
export const SHELL_NAV = [
  { to: "/requests", label: "Requests", icon: ListChecks },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/referrer-home", label: "Refer", icon: ArrowUpRight },
] as const;

export const SHELL_SPACE = [
  { to: "/profile", label: "Profile", shortLabel: "Profile", icon: UserRound },
  { to: "/work", label: "My work", shortLabel: "Work", icon: Briefcase },
  { to: "/plans", label: "Plans & credits", shortLabel: "Plans", icon: Crown },
  { to: "/settings", label: "Settings", shortLabel: "Settings", icon: SettingsIcon },
] as const;

export const SHELL_MORE = [
  // Placeholders until kit batches ship: /support stands in for /help,
  // /employer stands in for the /for-companies sales page.
  { to: "/support", label: "Help & safety", icon: ShieldCheck },
  { to: "/employer", label: "For companies", icon: Building2 },
] as const;

export const SHELL_TABS = [...SHELL_NAV, { to: "/plans", label: "Plans & credits", shortLabel: "Plans", icon: Crown }] as const;

function isActive(path: string, to: string) {
  return path === to || path.startsWith(`${to}/`);
}

function NavItem({ to, label, onNavigate }: { to: string; label: string; onNavigate?: () => void }) {
  const [path] = useLocation();
  const active = isActive(path, to);
  const item = [...SHELL_NAV, ...SHELL_SPACE].find(n => n.to === to);
  const Icon = item?.icon ?? ListChecks;
  return (
    <Link
      href={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[18px] px-3 text-sm font-semibold ${
        active ? "bg-[#ededff] text-black" : "text-[#505050]"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </Link>
  );
}

function ShellBody({ onNavigate }: { onNavigate: () => void }) {
  const { isSignedIn } = useAuth();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <nav aria-label="Main navigation" className="grid gap-1">
        {SHELL_NAV.map(item => (
          <NavItem key={item.to} to={item.to} label={item.label} onNavigate={onNavigate} />
        ))}
      </nav>
      <p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[.14em] text-[#767676]">Your space</p>
      <nav aria-label="Your space" className="grid gap-1">
        {SHELL_SPACE.map(item => (
          <NavItem key={item.to} to={item.to} label={item.label} onNavigate={onNavigate} />
        ))}
      </nav>
      <details className="group pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[18px] px-3 text-sm font-semibold text-[#505050]">
          More
        </summary>
        <nav aria-label="More" className="grid gap-1 pt-1">
          {SHELL_MORE.map(item => (
            <NavItem key={item.to} to={item.to} label={item.label} onNavigate={onNavigate} />
          ))}
        </nav>
      </details>
      <div className="mt-auto pt-6">
        <div className="rounded-[18px] border border-[#e5e5e5] bg-[#f5f5f5] p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-black">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            Referrals are free. Always.
          </p>
          <p className="mt-1 text-xs leading-5 text-[#505050]">No commissions. No paid priority.</p>
        </div>
        <div className="mt-3">
          {isSignedIn ? (
            <AccountMenu />
          ) : (
            <SignInButton>
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[18px] bg-[#0000ff] px-5 text-sm font-bold text-white"
              >
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);
  return (
    <div className="min-h-dvh bg-white text-black">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[#e5e5e5] bg-white p-5 md:flex" aria-label="App sidebar">
        <Brand />
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <ShellBody onNavigate={() => undefined} />
        </div>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button type="button" onClick={close} aria-label="Close menu" className="grid min-h-11 min-w-11 place-items-center rounded-[18px] text-black">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ShellBody onNavigate={close} />
          </div>
        </div>
      )}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-[#e5e5e5] bg-white px-4 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid min-h-11 min-w-11 place-items-center rounded-[18px] text-black md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#767676]">Private by default</span>
          <Link
            href="/alerts"
            aria-label="Alerts"
            className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-[18px] text-black"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Link>
        </header>
        <div className="pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#e5e5e5] bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-2 md:hidden">
          {SHELL_TABS.map(item => {
            const active = isActive(path, item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-[18px] text-[10px] font-semibold ${
                  active ? "text-[#0000ff]" : "text-[#505050]"
                }`}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {"shortLabel" in item ? item.shortLabel : item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-[18px] text-[10px] font-semibold text-[#505050]"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
