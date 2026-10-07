import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, ChartNoAxesCombined, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";

export type AdminView = "overview" | "companies" | "verifications" | "reports" | "users";
const items = [
  ["overview", "Overview", ChartNoAxesCombined], ["companies", "Companies", Building2], ["verifications", "Verifications", ShieldCheck], ["reports", "Safety reports", ShieldAlert], ["users", "Users", UsersRound],
] as const;

export function AdminShell({ view, onView, children }: { view: AdminView; onView: (view: AdminView) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="admin-shell">
    <aside className={open ? "admin-sidebar open" : "admin-sidebar"}><div className="admin-mode">INTERNAL OPERATIONS</div><Link className="wordmark" to="/">SkipWait<span className="brand-dot">.</span></Link><nav>{items.map(([id, label, Icon]) => <Button key={id} variant="ghost" className={view === id ? "active" : ""} onClick={() => { onView(id); setOpen(false); }}><Icon />{label}</Button>)}</nav><Button variant="outline" asChild><Link to="/explore"><ArrowLeft />Exit admin</Link></Button></aside>
    <div className="admin-main"><header className="admin-topbar"><Button variant="ghost" className="admin-menu" onClick={() => setOpen(!open)}>Menu</Button><span><ShieldCheck />All decisions should be documented</span><span className="preview-label">DESIGN PREVIEW</span></header>{children}</div>
  </div>;
}