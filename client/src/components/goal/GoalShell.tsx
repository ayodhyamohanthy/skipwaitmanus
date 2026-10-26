// GoalShell (spec §4.1): rail + top bar on desktop, top bar + bottom bar on
// phones. The wordmark is a wordmark, not a black block (BRIEF.md §116).
// Nothing here fetches: credits, verification and menu arrive as props.
import { Bell, Coins } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { BetaBadge } from "@/components/BetaNotice";
import { goalNavFor, type GoalNavId } from "./nav";
import { GoalMoreMenu } from "./GoalMoreMenu";
import { GoalNum } from "./GoalNum";
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
  account: { initials: string; menu?: ReactNode };
  alertsHref: string;
  /** Designer review (W0): signed-out visitors get no bell — /alerts is a dead end without sign-in. */
  showAlerts?: boolean;
  giveReferralHref?: string;
  hideBottomBar?: boolean;
  drawer?: ReactNode;
  children: ReactNode;
};

function CreditsPill({ credits, compact }: { credits: GoalShellCredits; compact?: boolean }) {
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
  // Comp: the numeral is mono, "credits" is sans (button.credits.hit = 44px target via g-hit).
  return (
    <a
      href="/plans"
      data-testid="goal-credits-pill"
      aria-label={`${credits.count} credits available. Open credit details`}
      className={cn("g-hit inline-flex items-center gap-1.5 rounded-g-control border border-g-control-edge pl-2.5 pr-3 text-g-meta text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover", compact ? "h-9" : "h-8")}
    >
      <Coins aria-hidden="true" className="size-4 text-g-ink-2" strokeWidth={1.75} />
      <GoalNum>{credits.count}</GoalNum>
      {compact ? null : <span>{" "}credits</span>}
    </a>
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

function Avatar({ initials }: { initials: string }) {
  // Signed out there is no one to show: an empty grey circle reads as broken.
  if (!initials) return null;
  return (
    <button
      type="button"
      data-testid="goal-avatar"
      aria-label="Account menu"
      className="g-hit inline-flex size-8 items-center justify-center rounded-full bg-g-surface-selected text-[12px]/4 font-semibold tracking-[0.02em] text-g-ink-2 ring-1 ring-inset ring-g-hairline"
    >
      {initials}
    </button>
  );
}

function AccountSlot({ account }: { account: GoalShellProps["account"] }) {
  return account.menu ? <>{account.menu}</> : <Avatar initials={account.initials} />;
}

export function GoalShell({ active, verifiedReferrer, pageTitle, credits, account, alertsHref, showAlerts = true, giveReferralHref = referrerSignInHref(), hideBottomBar = false, drawer, children }: GoalShellProps) {
  const items = goalNavFor(verifiedReferrer);
  return (
    <div
      data-testid="goal-shell"
      className={cn(
        "g-scope grid min-h-screen",
        drawer ? "gdesk:grid-cols-[var(--g-rail-w)_minmax(0,1fr)_var(--g-drawer-w)]" : "gdesk:grid-cols-[var(--g-rail-w)_minmax(0,1fr)]",
        "gdesk:grid-rows-[var(--g-topbar-h)_minmax(0,1fr)]",
        hideBottomBar
          ? "max-gdesk:grid-rows-[56px_minmax(calc(100vh-56px),auto)]"
          : "max-gdesk:grid-rows-[56px_minmax(calc(100vh-56px-56px),auto)_56px]",
      )}
    >
      {/* Desktop rail */}
      <nav aria-label="Primary" className="max-gdesk:hidden gdesk:sticky gdesk:top-0 gdesk:h-screen gdesk:self-start gdesk:row-span-2 gdesk:col-start-1 gdesk:row-start-1 flex flex-col items-center border-r border-g-hairline bg-g-surface-sunken px-2 pb-5">
        <span className="flex h-14 items-center"><a href="/" className="text-[14px]/5 font-bold tracking-[-0.02em] text-g-ink">skipwait.me</a></span>
        <div className="mt-2 flex w-full flex-col items-center gap-1">
          {items.map(item => (
            <a
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
            </a>
          ))}
        </div>
        <div className="mt-auto flex w-full flex-col items-center gap-4">
          <GoalMoreMenu variant="rail" />
          {!verifiedReferrer ? <GiveReferralLink href={giveReferralHref} variant="rail" /> : null}
          <AccountSlot account={account} />
        </div>
      </nav>

      {/* Top bar */}
      <header className={cn("gdesk:col-start-2 gdesk:col-end-[-1] gdesk:row-start-1 flex h-14 items-center gap-2 border-b border-g-hairline bg-g-surface pr-3 pl-6", "max-gdesk:gap-1 max-gdesk:pr-1 max-gdesk:pl-2.5")}>
        {/* phone: avatar left, no wordmark (BRIEF.md §149) */}
        <span className="gdesk:hidden mx-0.5 flex items-center gap-2">
          <AccountSlot account={account} />
          {!verifiedReferrer ? <GiveReferralLink href={giveReferralHref} variant="bar" /> : null}
        </span>
        <h1 className="max-gdesk:hidden text-g-meta text-g-ink-3">{pageTitle}</h1>
        <span className="ml-auto flex items-center gap-2">
          <BetaBadge tone="goal" />
          <span className="max-gdesk:hidden"><CreditsPill credits={credits} /></span>
          <span className="gdesk:hidden"><CreditsPill credits={credits} compact /></span>
          {showAlerts ? (
            <a href={alertsHref} aria-label="Alerts" className="g-hit inline-flex size-9 items-center justify-center rounded-g-control text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink max-gdesk:size-11">
              <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </a>
          ) : null}
        </span>
      </header>

      {/* Main */}
      {/* Main. Pinned to row 2 on phone: the bottom bar spans rows 2..-1
          (sticky, self-end), so an auto-placed main would skip the occupied
          rows and land in an implicit 4th row below a blank viewport. */}
      <main className="max-gdesk:col-start-1 max-gdesk:row-start-2 gdesk:col-start-2 gdesk:row-start-2 min-w-0">{children}</main>

      {/* Desktop drawer column */}
      {drawer ? <div className="max-gdesk:hidden gdesk:col-start-3 gdesk:row-start-2">{drawer}</div> : null}

      {/* Phone bottom bar */}
      {!hideBottomBar ? (
        <nav data-goal-bottom-bar="" aria-label="Primary" className="gdesk:hidden max-gdesk:sticky max-gdesk:bottom-0 max-gdesk:z-20 max-gdesk:col-start-1 max-gdesk:row-start-2 max-gdesk:row-end-[-1] max-gdesk:self-end flex h-14 items-stretch border-t border-g-hairline bg-g-surface">
          {items.map(item => (
            <a
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
            </a>
          ))}
          <GoalMoreMenu variant="bar" />
        </nav>
      ) : null}
    </div>
  );
}
