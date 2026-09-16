import { referralStatusLabels, type ReferralStatus } from "@shared/referral";

// Design 1.1 status vocabulary: one badge per item, dot + text label (never
// color-only), identical mapping on every surface. bg is a 10% alpha tint and
// the text color passes 4.5:1 on white per the accessibility baseline.
export type StatusTone = "amber" | "blue" | "green" | "red" | "slate";
export const statusToneColors: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  amber: { bg: "rgba(180,83,9,.1)", text: "#b45309", dot: "#b45309" },
  blue: { bg: "rgba(232,68,46,.1)", text: "#191713", dot: "#0B57D0" },
  green: { bg: "rgba(21,128,61,.1)", text: "#15803d", dot: "#15803d" },
  red: { bg: "rgba(185,28,28,.1)", text: "#b91c1c", dot: "#b91c1c" },
  slate: { bg: "rgba(28,27,25,.08)", text: "#3F3B33", dot: "#625D52" },
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
