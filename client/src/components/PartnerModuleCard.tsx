import { ExternalLink } from "lucide-react";

/**
 * Contextual High-Intent Partner Module slot: a single third-party tooling card
 * (interview prep, resume vetting) inserted into seeker-facing role feeds.
 * Clicks are tracked server-side; the CTA opens in a new tab.
 */
export type PartnerModuleRow = { id: number; partnerName: string; headline: string; description: string | null; ctaLabel: string; ctaUrl: string };

export function PartnerModuleCard({ module }: { module: PartnerModuleRow }) {
  const trackClick = () => { void fetch(`/api/partners/${module.id}/click`, { method: "POST", credentials: "include" }).catch(() => undefined); };
  return <li data-skipwait-screen="partner-module" className="rounded-xl border border-primary-tint-strong bg-primary-tint/60 p-4"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Partner tip · {module.partnerName}</p><h2 className="mt-2 text-sm font-bold text-slate-900">{module.headline}</h2>{module.description ? <p className="mt-1 text-xs leading-5 text-slate-600">{module.description}</p> : null}<a href={module.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={trackClick} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary-tint-strong bg-surface px-3.5 py-2 text-xs font-bold text-primary">{module.ctaLabel}<ExternalLink className="h-3.5 w-3.5" /></a></li>;
}
