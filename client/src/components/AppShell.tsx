import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { GoalShell, goalInitials, type GoalAccount, type GoalCredits, type GoalNavId } from "@/components/goal";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { useCreditBalance, useUnreadAlerts } from "@/lib/goalShellData";
import { clearPrivateReferralBrowserData } from "@/lib/logoutPrivacy";

/**
 * The signed-in app shell (D-048 phase 3; DESIGN.md "Layout"): one navigation for everyone (Find, My asks, Inbox),
 * plus the Referral queue for a verified referrer (the server's verdict, useReferrerAccess), and a quiet "Give a
 * referral" link for everyone else. Pages that have moved to the goal UI pass their own props; every other page
 * keeps calling <AppShell> with children only, and the route decides the active place and the page title.
 */
type RouteInfo = { active: GoalNavId | null; title: string; referrerSurface: boolean };

const ROUTES: ReadonlyArray<{ test: (path: string) => boolean } & RouteInfo> = [
  { test: path => path === "/explore" || path.startsWith("/explore/") || path === "/ask", active: "find", title: "Find a referral", referrerSurface: false },
  { test: path => path === "/requests", active: "asks", title: "My asks", referrerSurface: false },
  { test: path => path === "/queue", active: "queue", title: "Referral queue", referrerSurface: true },
  { test: path => path === "/inbox" || path.startsWith("/thread") || path.startsWith("/conversation/"), active: "inbox", title: "Inbox", referrerSurface: false },
  { test: path => path === "/referrer/impact", active: "queue", title: "Impact", referrerSurface: true },
  { test: path => path === "/referrer-home", active: "queue", title: "Referrer home", referrerSurface: true },
  { test: path => path === "/referrer-setup", active: "queue", title: "Referrer setup", referrerSurface: true },
  { test: path => path === "/referrer" || path === "/verify", active: null, title: "Give a referral", referrerSurface: true },
  { test: path => path === "/alerts", active: null, title: "Alerts", referrerSurface: false },
  { test: path => path === "/settings", active: null, title: "Settings", referrerSurface: false },
  { test: path => path === "/profile", active: null, title: "Profile", referrerSurface: false },
  { test: path => path === "/work", active: null, title: "My work", referrerSurface: false },
  { test: path => path === "/plans" || path === "/billing", active: null, title: "Plans and credits", referrerSurface: false },
  { test: path => path === "/help" || path === "/safety", active: null, title: "Help", referrerSurface: false },
  { test: path => path === "/assistants" || path === "/approve", active: null, title: "Assistants", referrerSurface: false },
  { test: path => path === "/invite", active: null, title: "Invite", referrerSurface: false },
  { test: path => path === "/onboarding", active: null, title: "Get started", referrerSurface: false },
];

export function shellRouteInfo(path: string): RouteInfo {
  const found = ROUTES.find(route => route.test(path));
  return found ? { active: found.active, title: found.title, referrerSurface: found.referrerSurface } : { active: null, title: "SkipWait", referrerSurface: false };
}

function accountItems(verifiedReferrer: boolean, signOut: () => void): GoalAccount["items"] {
  return [
    { label: "Profile", href: "/profile" },
    { label: "My work", href: "/work" },
    { label: "Plans and credits", href: "/plans" },
    ...(verifiedReferrer ? [{ label: "Impact", href: "/referrer/impact" }, { label: "Referrer home", href: "/referrer-home" }] : []),
    { label: "Direct messages", href: "/messages" },
    { label: "Internal openings", href: "/wall" },
    { label: "Connected assistants", href: "/assistants" },
    { label: "Share SkipWait", href: "/share" },
    { label: "Help and safety", href: "/help" },
    { label: "For companies", href: "/for-companies" },
    { label: "Settings", href: "/settings" },
    { label: "Sign out", onSelect: signOut },
  ];
}

const SIGNED_OUT_MORE: GoalAccount["items"] = [
  { label: "Help and safety", href: "/help" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
  { label: "For companies", href: "/for-companies" },
];

export type AppShellProps = {
  children: ReactNode;
  /** Moved screens set these; other pages get them from the route. */
  active?: GoalNavId | null;
  title?: string;
  drawer?: ReactNode;
  hideBottomBar?: boolean;
};

export function AppShell({ children, active, title, drawer, hideBottomBar }: AppShellProps) {
  const [path] = useLocation();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const access = useReferrerAccess();
  const verifiedReferrer = access.status === "verified";
  const route = shellRouteInfo(path);
  const showCredits = Boolean(isSignedIn) && !route.referrerSurface;
  const balance = useCreditBalance(showCredits);
  const unread = useUnreadAlerts(Boolean(isSignedIn));

  // The document scrolls, so a new page starts at the top like the old shell.
  useEffect(() => { if (typeof window !== "undefined") window.scrollTo?.({ top: 0 }); }, [path]);

  const credits: GoalCredits | null = !showCredits
    ? null
    : balance.isSuccess
      ? { state: "ready", count: balance.data, href: "/plans" }
      : balance.isError
        ? { state: "error", onRetry: () => { void balance.refetch(); } }
        : { state: "loading" };

  const name = user?.fullName?.trim() || user?.primaryEmailAddress?.emailAddress || "Your account";
  const signOutEverywhere = () => { void clearPrivateReferralBrowserData().finally(() => { void signOut(); }); };
  const account: GoalAccount | null = isLoaded && isSignedIn ? { initials: goalInitials(name), name, items: accountItems(verifiedReferrer, signOutEverywhere) } : null;
  const navActive = active !== undefined ? active : route.active === "queue" && !verifiedReferrer ? null : route.active;
  const returnTo = typeof window === "undefined" ? path : `${window.location.pathname}${window.location.search}`;

  return (
    <GoalShell
      active={navActive}
      verifiedReferrer={verifiedReferrer}
      pageTitle={title ?? route.title}
      credits={credits}
      account={account}
      more={account ? undefined : SIGNED_OUT_MORE}
      signInHref={`/sign-in?${new URLSearchParams({ returnTo })}`}
      alerts={isSignedIn ? { href: "/alerts", unread: unread.data ?? 0 } : null}
      drawer={drawer}
      hideBottomBar={hideBottomBar}
    >
      {children}
    </GoalShell>
  );
}
