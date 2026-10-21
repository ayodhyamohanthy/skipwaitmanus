// Beta badge + notice line for the betaNotice.ts config (owner, Oct 21).
// Two tones: "goal" (monochrome goal landing) and "kit" (existing app shell).
import { Link } from "wouter";
import { BETA_BADGE_LABEL, BETA_NOTICE_ENABLED, BETA_NOTICE_LINE, BETA_NOTICE_LINK } from "@/lib/betaNotice";

export function BetaBadge({ tone = "kit" }: { tone?: "kit" | "goal" }) {
  if (!BETA_NOTICE_ENABLED) return null;
  const cls = tone === "goal"
    ? "inline-flex items-center rounded-[3px] border border-g-ink px-1.5 py-px text-[10px] uppercase tracking-[0.14em] text-g-ink"
    : "inline-flex items-center rounded-[3px] border border-[#141414] px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.14em] text-[#141414]";
  return <span className={cls} data-testid="beta-badge">{BETA_BADGE_LABEL}</span>;
}

export function BetaNoticeLine({ tone = "kit" }: { tone?: "kit" | "goal" }) {
  if (!BETA_NOTICE_ENABLED) return null;
  const [pre, post] = BETA_NOTICE_LINE.split(BETA_NOTICE_LINK.word);
  const cls = tone === "goal" ? "mt-3 text-g-meta text-g-ink-3" : "mt-3 text-xs leading-5 text-[#505050]";
  const linkCls = tone === "goal"
    ? "underline decoration-g-control-edge underline-offset-[3px] transition-colors duration-(--g-dur-hover) ease-g-out hover:decoration-g-ink"
    : "underline decoration-[#141414]/40 underline-offset-[3px] hover:decoration-[#141414]";
  return (
    <p className={cls} data-testid="beta-notice-line">
      {pre}
      <Link href={BETA_NOTICE_LINK.href} className={linkCls}>{BETA_NOTICE_LINK.word}</Link>
      {post}
    </p>
  );
}
