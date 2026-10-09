import { useAuth } from "@/_core/auth";
import { ArrowRight, ArrowUpRight, Bell, Bot, Briefcase, Building2, ChevronDown, Compass, Crown, Ellipsis, Globe2, Inbox, ListChecks, Menu, ShieldCheck, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AccountMenu } from "./AccountMenu";
import { Button } from "@/components/kit/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Kit-exact app shell (skipwait-shell.tsx): desktop sidebar + mobile bottom
 * tab bar, More menu, alerts bell, safe-area insets. Destinations are live
 * routes; kit-only destinations swap in with their batches (/help and
 * /for-companies are live). Signed-in users see account controls where the
 * kit (signed-out preview) shows Sign in.
 */
const navigation = [
  { to: "/explore", label: "Explore", mobileLabel: "Explore", icon: Compass },
  { to: "/requests", label: "Requests", mobileLabel: "Requests", icon: ListChecks },
  { to: "/inbox", label: "Inbox", mobileLabel: "Inbox", icon: Inbox },
  { to: "/referrer-home", label: "Refer", mobileLabel: "Refer", icon: ArrowUpRight },
] as const;

const accountLinks = [
  { to: "/profile", label: "Profile", mobileLabel: "Profile", icon: UserRound },
  { to: "/work", label: "My work", mobileLabel: "Work", icon: Briefcase },
  { to: "/plans", label: "Plans & credits", mobileLabel: "Plans", icon: Crown },
] as const;

export const SHELL_TABS = [...navigation, ...accountLinks].map(item => ({ to: item.to, label: item.label, shortLabel: item.mobileLabel, icon: item.icon }));

function MoreMenu({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label="More" className={mobile ? "!flex h-auto min-h-[45px] flex-col gap-[5px] rounded-none p-0 text-[9px] text-muted-foreground" : "nav-item h-auto min-h-12 w-full justify-start"}>
          <Ellipsis size={20} /><span>More</span>{!mobile && <ChevronDown className="ml-auto" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mobile ? "end" : "start"} side={mobile ? "top" : "bottom"} sideOffset={8} className="w-56 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Help &amp; info</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11"><Link href="/help" onClick={onNavigate}><ShieldCheck />Help &amp; safety</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11"><Link href="/assistants" onClick={onNavigate}><Bot />Connected assistants</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>For teams</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11"><Link href="/for-companies" onClick={onNavigate}><Building2 />For companies</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { isSignedIn } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const isActive = (to: string) => path === to || path.startsWith(`${to}/`);
  const close = () => setDrawer(false);
  return (
    <div className="app-shell">
      <aside className={`app-sidebar overflow-y-auto${drawer ? " is-open" : ""}`}>
        <Link href="/" className="wordmark" onClick={close}><span className="brand-mark"><ArrowUpRight /></span>SkipWait<span className="brand-dot">.</span></Link>
        <div className="sidebar-caption">A LITTLE CONNECTION.<br />A BIG NEXT STEP.</div>
        <nav aria-label="Main navigation">
          {navigation.map(item => (
            <Link key={item.to} href={item.to} onClick={close} aria-current={isActive(item.to) ? "page" : undefined} className={`nav-item${isActive(item.to) ? " active" : ""}`}>
              <item.icon size={20} />{item.label}{isActive(item.to) && <ArrowRight size={16} className="nav-arrow" />}
            </Link>
          ))}
          <div className="nav-caption">Your space</div>
          {accountLinks.map(item => (
            <Link key={item.to} href={item.to} onClick={close} aria-current={isActive(item.to) ? "page" : undefined} className={`nav-item${isActive(item.to) ? " active" : ""}`}>
              <item.icon size={20} />{item.label}{isActive(item.to) && <ArrowRight size={16} className="nav-arrow" />}
            </Link>
          ))}
          <MoreMenu onNavigate={close} />
        </nav>
        <div className="sidebar-bottom !pt-6">
          <div className="free-promise"><ShieldCheck size={21} /><strong>Referrals are free.<br />Always.</strong></div>
          <p>No commissions. No paid priority.<br />Just people opening doors.</p>
          {isSignedIn ? <AccountMenu /> : <Button variant="outline" asChild><Link href="/sign-in" onClick={close}>Sign in</Link></Button>}
          <div className="global-note"><Globe2 size={14} />Built for your next move.</div>
        </div>
      </aside>
      {drawer ? <div className="drawer-scrim" onClick={close} aria-hidden="true" /> : null}
      <div className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand">
            <Button variant="ghost" size="icon" aria-label={drawer ? "Close menu" : "Open menu"} onClick={() => setDrawer(!drawer)}>{drawer ? <X /> : <Menu />}</Button>
            <Link href="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>
            <Button variant="ghost" size="icon" asChild className="ml-auto md:hidden"><Link href="/alerts" aria-label="Alerts"><Bell /></Link></Button>
          </div>
          <span className="desktop-top-label">GOOD OPPORTUNITIES START WITH PEOPLE.</span>
          <div className="topbar-actions">
            <span className="private-note"><ShieldCheck size={15} />Private by default</span>
            <Button variant="ghost" size="icon" asChild><Link href="/alerts" aria-label="Alerts"><Bell /></Link></Button>
            {isSignedIn ? <AccountMenu /> : <Button variant="ghost" asChild><Link href="/sign-in">Sign in</Link></Button>}
          </div>
        </header>
        {children}
        <footer className="app-footer"><span>SkipWait · A warmer way in.</span><Link href="/safety">Free referrals. Real expectations. <ArrowUpRight size={13} /></Link></footer>
      </div>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {[...navigation, ...accountLinks].map(item => (
          <Link key={item.to} href={item.to} aria-current={isActive(item.to) ? "page" : undefined} className={isActive(item.to) ? "active" : ""}>
            <item.icon size={20} /><span>{item.mobileLabel}</span>
          </Link>
        ))}
        <MoreMenu mobile onNavigate={close} />
      </nav>
    </div>
  );
}
