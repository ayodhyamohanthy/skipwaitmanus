import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function StateChips<T extends string>({ label = "Preview state:", states, value, onChange }: { label?: string; states: readonly T[]; value: T; onChange: (v: T) => void }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2 text-xs"><span className="example-banner !m-0"><ShieldCheck />DESIGN PREVIEW</span><span className="text-muted-foreground">{label}</span>{states.map(s => <button key={s} type="button" onClick={() => onChange(s)} aria-pressed={value === s} className={`min-h-8 rounded-full border px-3 ${value === s ? "border-primary bg-primary/5 font-semibold" : "border-border hover:bg-muted"}`}>{s}</button>)}</div>;
}

export function Panel({ children, className = "", tone = "card" }: { children: ReactNode; className?: string; tone?: "card" | "muted" | "accent" }) {
  const t = tone === "muted" ? "bg-muted" : tone === "accent" ? "bg-accent text-accent-foreground" : "border border-border bg-card";
  return <section className={`rounded-3xl p-5 sm:p-6 ${t} ${className}`}>{children}</section>;
}

export function Heading({ eyebrow, title, text, aside }: { eyebrow: string; title: string; text?: string; aside?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}<span className="brand-dot">.</span></h1>{text && <p>{text}</p>}</div>{aside}</div>;
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-border py-3 text-left last:border-0"><span><strong className="block text-sm">{label}</strong>{hint && <small className="text-muted-foreground">{hint}</small>}</span><span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`absolute top-1 size-5 rounded-full bg-background transition-all ${on ? "left-6" : "left-1"}`} /></span></button>;
}

export const field = "mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-base";
