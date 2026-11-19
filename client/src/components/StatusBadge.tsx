import { referralStatusLabels, type ReferralStatus } from "@shared/referral";

// Status vocabulary (DESIGN.md, "Scoreboard" world): one stamp-like mark per
// item, dot + text label (never color-only), identical mapping on every surface.
// Each tone pairs a signal ground with ink-weight text that passes 4.5:1.
export type StatusTone = "amber" | "blue" | "green" | "red" | "slate";
export const statusToneColors: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  amber: { bg: "rgba(138,90,11,.12)", text: "#B45309", dot: "#B45309" },
  blue: { bg: "rgba(19,19,17,.07)", text: "#141414", dot: "#141414" },
  green: { bg: "rgba(29,107,60,.12)", text: "#15803d", dot: "#15803d" },
  red: { bg: "rgba(176,35,24,.12)", text: "#B91C1C", dot: "#B91C1C" },
  slate: { bg: "rgba(19,19,17,.05)", text: "#505050", dot: "#767676" },
};
export const referralStatusTones: Record<ReferralStatus, StatusTone> = { pending: "amber", approved: "green", declined: "red", intro_made: "blue", interview: "blue", offer: "green", closed: "slate", withdrawn: "slate" };
export type StatusBadgeLabel = { label: string; tone: StatusTone };
export function statusBadgeTone(label: string, tone: StatusTone): StatusBadgeLabel { return { label, tone }; }

export default function StatusBadge({ status, label, tone }: { status?: ReferralStatus; label?: string; tone?: StatusTone }) {
  const resolvedTone = tone ?? (status ? referralStatusTones[status] : "amber");
  const resolvedLabel = label ?? (status ? referralStatusLabels[status] : "");
  const colors = statusToneColors[resolvedTone];
  return <span className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.12em]" style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.dot}33` }}><span aria-hidden="true" className="size-1.5" style={{ backgroundColor: colors.dot }} />{resolvedLabel}</span>;
}
