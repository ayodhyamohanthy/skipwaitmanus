import { referralStatusLabels, type ReferralStatus } from "@shared/referral";

// Design 1.1 status vocabulary: one badge per item, dot + text label (never
// color-only), identical mapping on every surface.
//
// These reference theme tokens rather than literals. The previous values were
// hardcoded (including #0B57D0, the Google blue the brand dropped) with 10% alpha
// tints that could not invert, so in dark mode the tint stayed light while the
// text stayed dark and contrast collapsed to ~1.5:1.
export type StatusTone = "amber" | "blue" | "green" | "red" | "slate";
export const statusToneColors: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  amber: { bg: "var(--color-warning-tint)", text: "var(--color-warning)", dot: "var(--color-warning)" },
  blue: { bg: "var(--color-primary-tint)", text: "var(--color-primary-ink)", dot: "var(--color-primary)" },
  green: { bg: "var(--color-success-tint)", text: "var(--color-success)", dot: "var(--color-success)" },
  red: { bg: "var(--color-danger-tint)", text: "var(--color-danger)", dot: "var(--color-danger)" },
  slate: { bg: "var(--color-slate-100)", text: "var(--color-slate-600)", dot: "var(--color-slate-500)" },
};
export const referralStatusTones: Record<ReferralStatus, StatusTone> = { pending: "amber", approved: "green", declined: "red", intro_made: "blue", interview: "blue", offer: "green", closed: "slate", withdrawn: "slate" };
export type StatusBadgeLabel = { label: string; tone: StatusTone };
export function statusBadgeTone(label: string, tone: StatusTone): StatusBadgeLabel { return { label, tone }; }

export default function StatusBadge({ status, label, tone }: { status?: ReferralStatus; label?: string; tone?: StatusTone }) {
  const resolvedTone = tone ?? (status ? referralStatusTones[status] : "amber");
  const resolvedLabel = label ?? (status ? referralStatusLabels[status] : "");
  const colors = statusToneColors[resolvedTone];
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: colors.bg, color: colors.text }}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />{resolvedLabel}</span>;
}
