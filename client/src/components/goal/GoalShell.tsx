import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Coins } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { gcn } from "./gcn";
import { GoalNum } from "./GoalNum";
import { goalNavFor, type GoalNavId } from "./nav";

export type GoalCredits =
  | { state: "ready"; count: number; href: string }
  | { state: "loading" }
  | { state: "error"; onRetry: () => void };

export type GoalAccountItem = { label: string; href: string } | { label: string; onSelect: () => void };
export type GoalAccount = { initials: string; name: string; items: readonly GoalAccountItem[] };

export type GoalShellProps = {
  /** The nav item this page belongs to, or null for pages outside the nav (settings, alerts). */
  active: GoalNavId | null;
  /** Server verdict. Adds the Referral queue and removes "Give a referral". */
  verifiedReferrer: boolean;
  pageTitle: string;
  /** Seeker pages only; referrers are never charged, so referrer pages pass null. */
  credits: GoalCredits | null;
  /** null when signed out. */
  account: GoalAccount | null;
  signInHref?: string;
  alerts: { href: string; unread: number } | null;
  giveReferralHref?: string;
  /** Hidden on an opened item on phones. */
  hideBottomBar?: boolean;
  /** Desktop docked drawer column (Find a referral). */
  drawer?: ReactNode;
  children: ReactNode;
};

function GiveReferralLink({ href, variant }: { href: string; variant: "rail" | "top" }) {
  return (
    <Link
      href={href}
      className={gcn(
        "group grid gap-0.5 rounded-g-control text-g-ink-2 hover:text-g-ink",
        variant === "rail" ? "justify-items-center px-1 py-1.5 text-center" : "min-h-(--g-touch) content-center px-1.5",
      )}
    >
      <span className="whitespace-nowrap text-g-meta tracking-normal underline decoration-g-control-edge underline-offset-[3px] group-hover:decoration-g-ink">Give a referral</span>
      <span className="whitespace-nowrap text-g-badge tracking-normal text-g-ink-3">Work email only</span>
    </Link>
  );
}

function CreditsPill({ credits }: { credits: GoalCredits }) {
  const pill = "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-g-control border border-g-control-edge pl-2.5 pr-3 text-g-meta text-g-ink max-gdesk:mr-1 max-gdesk:h-9";
  if (credits.state === "loading") {
    return (
      <span aria-busy="true" className={pill}>
        <Coins aria-hidden="true" className="size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
        <span aria-hidden="true" className="block h-2 w-12 rounded-g-keycap bg-g-surface-hover max-gdesk:w-3" />
        <span className="sr-only">Loading your credits</span>
      </span>
    );
  }
  if (credits.state === "error") {
    // Never a 0 when the balance failed to load (DESIGN.md rule 13): say so, and offer a retry.
    return (
      <button type="button" onClick={credits.onRetry} aria-label="Your balance didn’t load. Retry" className={gcn(pill, "transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover")}>
        <Coins aria-hidden="true" className="size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
        <span className="text-g-ink-2 max-gdesk:hidden">Balance didn’t load ·</span>
        <span className="underline decoration-g-control-edge underline-offset-[3px]">Retry</span>
      </button>
    );
  }
  const noun = credits.count === 1 ? "credit" : "credits";
  return (
    <Link
      href={credits.href}
      aria-label={`${credits.count} ${noun} available. Open credit details`}
      data-testid="goal-credits"
      className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-g-control border border-g-control-edge pl-2.5 pr-3 text-g-meta text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover max-gdesk:mr-1 max-gdesk:h-9"
    >
      <Coins aria-hidden="true" className="size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
      <span>
        <GoalNum>{credits.count}</GoalNum>
        <span className="max-gdesk:hidden"> {noun}</span>
      </span>
    </Link>
  );
}

function AlertsLink({ alerts }: { alerts: { href: string; unread: number } }) {
  const label = alerts.unread > 0 ? `Alerts, ${alerts.unread} unread` : "Alerts";
  return (
    <Link
      href={alerts.href}
      aria-label={label}
      className="relative inline-flex size-9 items-center justify-center rounded-g-control text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink max-gdesk:size-11"
    >
      <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
      {alerts.unread > 0 ? <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-g-ink ring-2 ring-g-surface max-gdesk:right-3 max-gdesk:top-3" /> : null}
    </Link>
  );
}

function AccountMenu({ account, side }: { account: GoalAccount; side: "right" | "bottom" }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="g-hit grid size-8 shrink-0 place-items-center rounded-full bg-g-surface-selected text-[12px] font-semibold leading-4 tracking-[0.02em] text-g-ink-2 ring-1 ring-inset ring-g-hairline"
      >
        {account.initials}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={side === "right" ? "end" : "start"}
          sideOffset={8}
          className="g-scope z-50 min-w-56 rounded-g-popover bg-g-surface p-1.5 text-g-ink shadow-g-popover data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in"
        >
          <DropdownMenu.Label className="truncate px-2 py-1.5 text-g-meta text-g-ink-3">{account.name}</DropdownMenu.Label>
          {account.items.map(item =>
            "href" in item ? (
              <DropdownMenu.Item key={item.label} asChild>
                <Link href={item.href} className="flex h-10 cursor-pointer items-center rounded-g-control px-2 text-g-body text-g-ink outline-none data-[highlighted]:bg-g-surface-hover">
                  {item.label}
                </Link>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item
                key={item.label}
                onSelect={item.onSelect}
                className="flex h-10 cursor-pointer items-center rounded-g-control px-2 text-g-body text-g-ink outline-none data-[highlighted]:bg-g-surface-hover"
              >
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SignInLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex h-9 items-center rounded-g-control px-3 text-g-label text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover max-gdesk:h-11">
      Sign in
    </Link>
  );
}

/** The goal app shell (DESIGN.md Layout): a 104px rail with one navigation on desktop, a 56px top bar, and a phone
 * bottom bar. The document scrolls (the rail, top bar and drawer column stay sticky), so pages that rely on window
 * scrolling keep working; list/detail screens size their own panes to the viewport. Every portalled goal surface
 * carries `g-scope` itself; this root carries it for everything inside. */
export function GoalShell({ active, verifiedReferrer, pageTitle, credits, account, signInHref = "/sign-in", alerts, giveReferralHref, hideBottomBar = false, drawer, children }: GoalShellProps) {
  const nav = goalNavFor(verifiedReferrer);
  const giveHref = giveReferralHref ?? referrerSignInHref();
  return (
    <div
      data-testid="goal-shell"
      className={gcn(
        "g-scope grid min-h-dvh grid-cols-1 grid-rows-[var(--g-topbar-h)_minmax(0,1fr)_auto] bg-g-canvas text-g-body text-g-ink",
        "gdesk:grid-cols-[var(--g-rail-w)_minmax(0,1fr)_auto] gdesk:grid-rows-[var(--g-topbar-h)_minmax(0,1fr)]",
      )}
    >
      <a href="#goal-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-g-control focus:bg-g-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <nav aria-label="Primary" className="hidden flex-col items-center border-r border-g-hairline bg-g-surface-sunken px-2 pb-5 gdesk:sticky gdesk:top-0 gdesk:col-start-1 gdesk:row-span-2 gdesk:row-start-1 gdesk:flex gdesk:h-dvh gdesk:self-start">
        <Link href="/" className="flex h-(--g-topbar-h) shrink-0 items-center text-[16px] font-bold leading-6 tracking-[-0.02em] text-g-ink">
          SkipWait
        </Link>
        <ul className="mt-2 flex flex-col gap-1">
          {nav.map(item => {
            const Icon = item.icon;
            const current = item.id === active;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={gcn(
                    "flex h-(--g-rail-tile-h) w-(--g-rail-tile-w) flex-col items-center justify-center gap-1 rounded-g-tile text-g-badge text-g-ink-3",
                    "transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink",
                    current && "bg-g-surface-selected font-semibold text-g-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  <span>{item.railLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="-mx-2 mt-auto flex w-[calc(100%+16px)] flex-col items-center gap-4">
          {!verifiedReferrer ? <GiveReferralLink href={giveHref} variant="rail" /> : null}
          {account ? <AccountMenu account={account} side="right" /> : null}
        </div>
      </nav>

      <header className="sticky top-0 z-30 flex h-(--g-topbar-h) items-center gap-1 border-b border-g-hairline bg-g-surface pl-2.5 pr-1 gdesk:col-span-2 gdesk:col-start-2 gdesk:row-start-1 gdesk:gap-2 gdesk:pl-6 gdesk:pr-3">
        <div className="flex min-w-0 items-center gap-1 gdesk:hidden">
          {account ? <span className="ml-0.5 mr-1.5"><AccountMenu account={account} side="bottom" /></span> : null}
          {!verifiedReferrer ? <GiveReferralLink href={giveHref} variant="top" /> : null}
        </div>
        <p className="hidden whitespace-nowrap text-g-meta text-g-ink-3 gdesk:block">{pageTitle}</p>
        <div className="ml-auto flex items-center gdesk:gap-2">
          {credits ? <CreditsPill credits={credits} /> : null}
          {alerts ? <AlertsLink alerts={alerts} /> : null}
          {!account ? <SignInLink href={signInHref} /> : null}
        </div>
      </header>

      <main id="goal-main" tabIndex={-1} className="min-w-0 outline-none gdesk:col-start-2 gdesk:row-start-2">
        {children}
      </main>

      {drawer ? <div className="hidden gdesk:sticky gdesk:top-(--g-topbar-h) gdesk:col-start-3 gdesk:row-start-2 gdesk:block gdesk:h-[calc(100dvh-var(--g-topbar-h))] gdesk:self-start">{drawer}</div> : null}

      {!hideBottomBar ? (
        <nav aria-label="Primary" className="sticky bottom-0 z-30 grid h-(--g-bottombar-h) auto-cols-fr grid-flow-col border-t border-g-hairline bg-g-surface gdesk:hidden">
          {nav.map(item => {
            const Icon = item.icon;
            const current = item.id === active;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={gcn("flex flex-col items-center justify-center gap-1 text-g-badge text-g-ink-3", current && "font-semibold text-g-ink")}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                <span>{item.railLabel}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
