import { ArrowLeft, Building2, ChartNoAxesCombined, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";

export type AdminView = "overview" | "companies" | "verifications" | "reports" | "users";

const items = [
  ["overview", "Overview", ChartNoAxesCombined], ["companies", "Companies", Building2], ["verifications", "Verifications", ShieldCheck], ["reports", "Safety reports", ShieldAlert], ["users", "Users", UsersRound],
] as const;

/** Kit v4 admin shell: dark operations sidebar (menu overlay on phones) and a quiet topbar. */
export function AdminShell({ view, onView, children }: { view: AdminView; onView: (view: AdminView) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="admin-shell">
    <aside id="admin-sidebar" className={open ? "admin-sidebar open" : "admin-sidebar"}><div className="admin-mode">INTERNAL OPERATIONS</div><Link className="wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link><nav aria-label="Admin sections">{items.map(([id, label, Icon]) => <Button key={id} variant="ghost" aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} onClick={() => { onView(id); setOpen(false); }}><Icon />{label}</Button>)}</nav><Button variant="outline" asChild><Link href="/explore"><ArrowLeft />Exit admin</Link></Button></aside>
    <div className="admin-main"><header className="admin-topbar"><Button variant="ghost" className="admin-menu" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(!open)}>Menu</Button><span><ShieldCheck />All decisions should be documented</span></header>{children}</div>
  </div>;
}

export function AdminHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="admin-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div>;
}
