import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Compass, Inbox, ListChecks, ShieldCheck, ArrowRight, Menu, X, Globe2, UserRound, Briefcase, Crown, Building2, Ellipsis, ChevronDown, Bell } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

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

function MoreMenu({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className={mobile ? "!flex h-auto min-h-[45px] flex-col gap-[5px] rounded-none p-0 text-[9px] text-muted-foreground" : "nav-item h-auto min-h-12 w-full justify-start"}>
        <Ellipsis size={mobile ? 20 : 20} /><span>More</span>{!mobile && <ChevronDown className="ml-auto" />}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align={mobile ? "end" : "start"} side={mobile ? "top" : "bottom"} sideOffset={8} className="w-56 max-w-[calc(100vw-2rem)]">
      <DropdownMenuLabel>Help & info</DropdownMenuLabel>
      <DropdownMenuItem asChild className="min-h-11"><Link to="/help" onClick={onNavigate}><ShieldCheck />Help & safety</Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>For teams</DropdownMenuLabel>
      <DropdownMenuItem asChild className="min-h-11"><Link to="/for-companies" onClick={onNavigate}><Building2 />For companies</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function SkipWaitShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [drawer, setDrawer] = useState(false);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  return <div className="app-shell">
    <aside className={`app-sidebar overflow-y-auto ${drawer ? "is-open" : ""}`}>
      <Link to="/" className="wordmark" onClick={() => setDrawer(false)}><span className="brand-mark"><ArrowUpRight /></span>SkipWait<span className="brand-dot">.</span></Link>
      <div className="sidebar-caption">A LITTLE CONNECTION.<br />A BIG NEXT STEP.</div>
      <nav aria-label="Main navigation">
        {navigation.map(item => <Link key={item.to} to={item.to} className={`nav-item ${isActive(item.to) ? "active" : ""}`} onClick={() => setDrawer(false)}><item.icon size={20} />{item.label}{isActive(item.to) && <ArrowRight size={16} className="nav-arrow" />}</Link>)}
        <div className="nav-caption">Your space</div>
        {accountLinks.map(item => <Link key={item.to} to={item.to} className={`nav-item ${isActive(item.to) ? "active" : ""}`} onClick={() => setDrawer(false)}><item.icon size={20} />{item.label}{isActive(item.to) && <ArrowRight size={16} className="nav-arrow" />}</Link>)}
        <MoreMenu onNavigate={() => setDrawer(false)} />
      </nav>
      <div className="sidebar-bottom !pt-6"><div className="free-promise"><ShieldCheck size={21} /><strong>Referrals are free.<br />Always.</strong></div><p>No commissions. No paid priority.<br />Just people opening doors.</p><Button variant="outline" asChild><Link to="/sign-in">Sign in</Link></Button>
        <div className="global-note"><Globe2 size={14} />Built for your next move.</div></div>
    </aside>
    {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
    <div className="app-main"><header className="app-topbar"><div className="mobile-brand"><Button variant="ghost" size="icon" aria-label={drawer ? "Close menu" : "Open menu"} onClick={() => setDrawer(!drawer)}>{drawer ? <X /> : <Menu />}</Button><Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link><Button variant="ghost" size="icon" asChild className="ml-auto md:hidden"><Link to="/alerts" aria-label="Alerts"><Bell /></Link></Button></div><span className="desktop-top-label">GOOD OPPORTUNITIES START WITH PEOPLE.</span><div className="topbar-actions"><span className="private-note"><ShieldCheck size={15} />Private by default</span><Button variant="ghost" size="icon" asChild><Link to="/alerts" aria-label="Alerts"><Bell /></Link></Button><Button variant="ghost" asChild><Link to="/sign-in">Sign in</Link></Button></div></header>{children}<footer className="app-footer"><span>SkipWait · A warmer way in.</span><Link to="/safety">Free referrals. Real expectations. <ArrowUpRight size={13} /></Link></footer></div>
    <nav className="mobile-tabs" aria-label="Mobile navigation">{[...navigation, ...accountLinks].map(item => <Link key={item.to} to={item.to} className={isActive(item.to) ? "active" : ""}><item.icon size={20} /><span>{item.mobileLabel}</span></Link>)}<MoreMenu mobile onNavigate={() => setDrawer(false)} /></nav>
  </div>;
}