import { Activity, CheckSquare, CreditCard, Database, HeartPulse, ShieldCheck, UsersRound, Wallet, EyeOff, Handshake } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/Brand";

/**
 * Shared administrator header (pending-screens spec §2.6 / §5 responsive).
 *
 * Every admin surface renders the same destinations in the same order,
 * so an operator never has to remember which page links where. The current
 * page is marked with `aria-current="page"` and the brand tint; the rest are
 * quiet pills. On narrow viewports the row scrolls horizontally instead of
 * wrapping into a wall of buttons.
 */
export type AdminSection = "approvals" | "payments" | "privacy-requests" | "token-recovery" | "activity" | "flow-health" | "users" | "partners" | "schema";

const sections: Array<{ id: AdminSection; href: string; label: string; icon: LucideIcon }> = [
  { id: "approvals", href: "/admin/approvals", label: "Approvals", icon: CheckSquare },
  { id: "payments", href: "/admin/payments", label: "Payment reviews", icon: CreditCard },
  { id: "partners", href: "/admin/partners", label: "Partners", icon: Handshake },
  { id: "privacy-requests", href: "/admin/privacy-requests", label: "Privacy requests", icon: EyeOff },
  { id: "token-recovery", href: "/admin/token-recovery", label: "Token recovery", icon: Wallet },
  { id: "activity", href: "/admin/activity", label: "Activity log", icon: Activity },
  { id: "flow-health", href: "/admin/flow-health", label: "Flow health", icon: HeartPulse },
  { id: "users", href: "/admin/users", label: "Users", icon: UsersRound },
  { id: "schema", href: "/admin/schema", label: "Schema", icon: Database },
];

export function AdminNav({ current, badge = "Admin only" }: { current: AdminSection; badge?: string }) {
  return <header className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-4">
      <Brand />
      <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />{badge}</span>
    </div>
    <nav aria-label="Administrator sections" className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <ul className="flex min-w-max items-center gap-2">
        {sections.map(section => {
          const active = section.id === current;
          const Icon = section.icon;
          return <li key={section.id}>
            <a href={section.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${active ? "border-[#0B57D0] bg-[#0B57D0] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"}`}>
              <Icon className={`h-4 w-4 ${active ? "text-white" : "text-[#0B57D0]"}`} />{section.label}
            </a>
          </li>;
        })}
      </ul>
    </nav>
  </header>;
}
