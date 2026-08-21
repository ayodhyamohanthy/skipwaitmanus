import { referralStatusLabels, type ReferralStatus } from "@shared/referral";

const statusStyles: Record<ReferralStatus, string> = { pending: "bg-amber-50 text-amber-700 ring-amber-200", approved: "bg-sky-50 text-sky-700 ring-sky-200", declined: "bg-rose-50 text-rose-700 ring-rose-200", intro_made: "bg-blue-50 text-blue-700 ring-blue-200", interview: "bg-blue-50 text-blue-700 ring-blue-200", offer: "bg-emerald-50 text-emerald-700 ring-emerald-200", closed: "bg-slate-100 text-slate-700 ring-slate-200" };

export default function StatusBadge({ status }: { status: ReferralStatus }) { return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusStyles[status]}`}>{referralStatusLabels[status]}</span>; }
