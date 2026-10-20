// GoalShell (spec §4.1): rail + top bar on desktop, top bar + bottom bar on
// phones. The wordmark is a wordmark, not a black block (BRIEF.md §116).
// Nothing here fetches: credits, verification and menu arrive as props.
// Phase 3 (D-048): destinations and the alerts bell navigate inside the SPA.
import { Bell, Coins } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { goalNavFor, type GoalNavId } from "./nav";
import { GoalNum } from "./GoalNum";
import { GoalIconButton } from "./GoalIconButton";
import { GoalButton } from "./GoalButton";

export type GoalShellCredits =
  | { state: "ready"; count: number }
  | { state: "loading" }
  | { state: "error"; onRetry(): void }
  | null;

export type GoalShellProps = {
  active: GoalNavId;
  verifiedReferrer: boolean;
  pageTitle: string;
  credits: GoalShellCredits;
  account: { initials: string; href?: string };
  alertsHref: string;
  creditsHref?: string;
  giveReferralHref?: string;
  hideBottomBar?: boolean;
  drawer?: ReactNode;
  children: ReactNode;
};

function CreditsPill({ credits, compact, href }: { credits: GoalShellCredits; compact?: boolean; href: string }) {
  if (credits === null) return null;
  if (credits.state === "loading") {
    return (
      <span data-testid="goal-credits-pill" aria-busy="true" className={cn("inline-flex items-center rounded-g-control border border-g-control-edge px-3", compact ? "h-9" : "h-8")}>
        <Coins aria-hidden="true" className="size-4 text-g-ink-2" strokeWidth={1.75} />
      </span>
    );
  }
  if (credits.state === "error") {
    // Never show 0 when the balance failed to load.
    return (
      <span data-testid="goal-credits-pill" className="inline-flex items-center gap-2 text-g-meta text-g-ink-2">
        Balance didn't load
        <GoalButton size="xs" variant="ghost" onClick={credits.onRetry}>Retry</GoalButton>
      </span>
    );
  }
  const label = compact ? String(credits.count) : `${credits.count} credits`;
  return (
    <Link
      href={href}
      data-testid="goal-credits-pill"
      aria-label={`${credits.count} credits available. Open credit details`}
      className={cn("inline-flex items-center gap-1.5 rounded-g-control border border-g-control-edge pl-2.5 pr-3 text-g-meta text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover", compact ? "h-9" : "h-8")}
    >
      <Coins aria-hidden="true" className="size-4 text-g-ink-2" strokeWidth={1.75} />
      <GoalNum>{label}</GoalNum>
    </Link>
  );
}

function GiveReferralLink({ href, variant }: { href: string; variant: "rail" | "bar" }) {
  return (
    <a
      data-testid="goal-give-referral"
      href={href}
      className={cn(
        "group inline-flex flex-col text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink",
        variant === "rail" ? "items-center rounded-g-control py-1.5" : "min-h-11 justify-center",
      )}
    >
      <span className="text-g-meta tracking-normal underline decoration-g-control-edge underline-offset-[3px] group-hover:decoration-g-ink">Give a referral</span>
      <span className="text-g-badge whitespace-nowrap text-g-ink-3 no-underline">Work email only</span>
    </a>
  );
}

function Avatar({ initials, href }: { initials: string; href: string }) {
  return (
    <Link
      href={href}
      data-testid="goal-avatar"
      aria-label="Account and settings"
      className="g-hit inline-flex size-8 items-center justify-center rounded-full bg-g-surface-selected text-[12px]/4 font-semibold tracking-[0.02em] text-g-ink-2 ring-1 ring-inset ring-g-hairline"
    >
      {initials}
    </Link>
  );
}

export function GoalShell({ active, verifiedReferrer, pageTitle, credits, account, alertsHref, creditsHref = "/plans", giveReferralHref = referrerSignInHref(), hideBottomBar = false, drawer, children }: GoalShellProps) {
  const items = goalNavFor(verifiedReferrer);
  const [, navigate] = useLocation();
  const accountHref = account.href ?? "/settings";
  return (
    <div
      data-testid="goal-shell"
      className={cn(
        "g-scope grid min-h-screen",
        drawer ? "gdesk:grid-cols-[var(--g-rail-w)_minmax(0,1fr)_var(--g-drawer-w)]" : "gdesk:grid-cols-[var(--g-rail-w)_minmax(0,1fr)]",
        "gdesk:grid-rows-[var(--g-topbar-h)_minmax(0,1fr)]",
        "max-gdesk:grid-rows-[56px_minmax(calc(100vh-56px-56px),auto)_56px]",
      )}
    >
      {/* Desktop rail */}
      <nav aria-label="Primary" className="max-gdesk:hidden gdesk:row-span-2 gdesk:col-start-1 gdesk:row-start-1 flex flex-col items-center border-r border-g-hairline bg-g-surface-sunken px-2 pb-5">
        <Link href="/" className="flex h-14 items-center text-[16px]/6 font-bold tracking-[-0.02em] text-g-ink">skipwait.me</Link>
        <div className="mt-2 flex w-full flex-col items-center gap-1">
          {items.map(item => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.id === active ? "page" : undefined}
              className={cn(
                "flex size-[88px] h-14 flex-col items-center justify-center gap-1 rounded-g-tile text-g-badge text-g-ink-3 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink",
                item.id === active && "bg-g-surface-selected font-semibold text-g-ink",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {item.railLabel}
            </Link>
          ))}
        </div>
        <div className="mt-auto flex w-full flex-col items-center gap-4">
          {!verifiedReferrer ? <GiveReferralLink href={giveReferralHref} variant="rail" /> : null}
          {account.initials ? <Avatar initials={account.initials} href={accountHref} /> : <Link href="/sign-in" className="text-g-meta text-g-ink-2 underline underline-offset-[3px]">Sign in</Link>}
        </div>
      </nav>

      {/* Top bar */}
      <header className={cn("gdesk:col-start-2 gdesk:col-end-[-1] gdesk:row-start-1 flex h-14 items-center gap-2 border-b border-g-hairline bg-g-surface pr-3 pl-6", "max-gdesk:gap-1 max-gdesk:pr-1 max-gdesk:pl-2.5")}>
        {/* phone: avatar left, no wordmark (BRIEF.md §149) */}
        <span className="gdesk:hidden mx-0.5 flex items-center gap-2">
          {account.initials ? <Avatar initials={account.initials} href={accountHref} /> : <Link href="/sign-in" className="text-g-meta text-g-ink-2 underline underline-offset-[3px]">Sign in</Link>}
          {!verifiedReferrer ? <GiveReferralLink href={giveReferralHref} variant="bar" /> : null}
        </span>
        <h1 className="max-gdesk:hidden text-g-meta text-g-ink-3">{pageTitle}</h1>
        <span className="ml-auto flex items-center gap-2">
          <span className="max-gdesk:hidden"><CreditsPill credits={credits} href={creditsHref} /></span>
          <span className="gdesk:hidden"><CreditsPill credits={credits} compact href={creditsHref} /></span>
          <GoalIconButton icon={Bell} aria-label="Alerts" onClick={() => navigate(alertsHref)} />
        </span>
      </header>

      {/* Main */}
      <main className="gdesk:col-start-2 gdesk:row-start-2 min-w-0">{children}</main>

      {/* Desktop drawer column */}
      {drawer ? <div className="max-gdesk:hidden gdesk:col-start-3 gdesk:row-start-2">{drawer}</div> : null}

      {/* Phone bottom bar */}
      {!hideBottomBar ? (
        <nav aria-label="Primary" className="gdesk:hidden flex h-14 items-stretch border-t border-g-hairline bg-g-surface">
          {items.map(item => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.id === active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-g-badge text-g-ink-3",
                item.id === active && "font-semibold text-g-ink",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {item.railLabel}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
