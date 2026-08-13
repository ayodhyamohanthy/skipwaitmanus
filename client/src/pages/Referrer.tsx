import { CheckCircle2, Copy, Download, ExternalLink, FileText, Mail, Paperclip, Plus, Send, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Brand } from "@/components/Brand";

const achievementMarker = "[Add one evidence-based accomplishment below]";

export default function Referrer() {
  const [decision, setDecision] = useState<"" | "approved" | "declined">("");
  const [message, setMessage] = useState("");
  const name = localStorage.getItem("bridge-seeker-attachment-name");
  const fileUrl = localStorage.getItem("bridge-seeker-attachment-url");
  const type = localStorage.getItem("bridge-seeker-attachment-type") || "";
  const candidate = localStorage.getItem("bridge-name") || "Avery";
  const targetUrl = localStorage.getItem("bridge-target-url") || "https://company.com/jobs/product-designer";
  const previewable = type === "application/pdf" || type.startsWith("image/");
  const [free, setFree] = useState(() => Number(localStorage.getItem("bridge-referrer-free-tokens") || 3));
  const [paid, setPaid] = useState(() => Number(localStorage.getItem("bridge-referrer-paid-tokens") || 0));
  const [accomplished, setAccomplished] = useState("");
  const [measuredBy, setMeasuredBy] = useState("");
  const [byDoing, setByDoing] = useState("");
  const initialEmail = useMemo(() => `Subject: Referral — ${candidate} for the role at this posting

Hi [Hiring Manager Name],

I’d like to recommend ${candidate} for this opportunity: ${targetUrl}

Based on their background and the work I’ve seen from them, I believe they would be a strong candidate for the team. ${achievementMarker}

I’ve attached their resume for your review and am happy to share more context if helpful.

Best,
[Your Name]`, [candidate, targetUrl]);
  const [email, setEmail] = useState(initialEmail);
  const total = free + paid;
  const addAchievement = () => {
    if (!accomplished.trim() || !measuredBy.trim() || !byDoing.trim()) return;
    const evidence = `For example, ${candidate} ${accomplished.trim()}, measured by ${measuredBy.trim()}, by ${byDoing.trim()}.`;
    setEmail((current) => current.includes(achievementMarker) ? current.replace(achievementMarker, evidence) : `${current}\n\n${evidence}`);
  };
  const decide = (approved: boolean) => {
    if (approved) { if (free) { setFree(free - 1); localStorage.setItem("bridge-referrer-free-tokens", String(free - 1)); } else { setPaid(paid - 1); localStorage.setItem("bridge-referrer-paid-tokens", String(paid - 1)); } setDecision("approved"); } else setDecision("declined");
  };

  if (decision) return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-[28px] bg-white p-9 text-center shadow-[0_20px_55px_rgba(31,25,72,.08)]">{decision === "approved" ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : <XCircle className="mx-auto h-12 w-12 text-slate-500" />}<h1 className="mt-5 text-3xl font-semibold">{decision === "approved" ? "Referral approved." : "Request declined."}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{decision === "approved" ? "Your personalized email is ready to copy and send to the hiring manager." : "The candidate will be notified respectfully."}</p><Link href="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Return to Bridge</Link></section></div></main>;

  return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-5xl"><Brand /><div className="mt-12 grid gap-6 lg:grid-cols-[1.35fr_.65fr]"><section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_20px_55px_rgba(31,25,72,.08)]"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">Incoming direct referral request</p><h1 className="mt-4 text-2xl font-semibold">{candidate} is requesting your referral</h1><a href={targetUrl} target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 rounded-xl bg-[#F8F8FC] p-3 text-sm font-medium text-violet-700"><ExternalLink className="h-4 w-4" /><span className="truncate">{targetUrl}</span></a><div className="mt-5 rounded-2xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Attached by Job Seeker</p>{name && fileUrl ? <><div className="mt-3 flex justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><FileText className="h-5 w-5" /></span><div><p className="text-sm font-semibold">{name}</p><p className="text-xs text-slate-500">{previewable ? "Viewing in place" : "Download-only document"}</p></div></div><a href={fileUrl} download={name} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Download className="h-3.5 w-3.5" />Download</a></div>{previewable ? <iframe title={`Resume preview for ${name}`} src={fileUrl} className="mt-4 h-[360px] w-full rounded-xl border border-slate-200 bg-slate-50" /> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This file cannot be previewed in the browser. Use Download to open the original document.</p>}</> : <p className="mt-2 text-sm text-slate-500">No resume or document was attached to this request.</p>}</div><div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><div className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 text-violet-700" /><div><p className="text-sm font-semibold text-violet-950">Write the hiring-manager email in your own voice</p><p className="mt-1 text-xs leading-5 text-violet-900">Use specific evidence: <strong>accomplished X + measured by Y + by doing Z.</strong></p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">Accomplished X<input value={accomplished} onChange={(event) => setAccomplished(event.target.value)} placeholder="improved activation" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label><label className="text-xs font-semibold text-slate-700">Measured by Y<input value={measuredBy} onChange={(event) => setMeasuredBy(event.target.value)} placeholder="24% in one quarter" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label><label className="text-xs font-semibold text-slate-700">By doing Z<input value={byDoing} onChange={(event) => setByDoing(event.target.value)} placeholder="redesigning onboarding" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label></div><button type="button" onClick={addAchievement} disabled={!accomplished || !measuredBy || !byDoing} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add to email</button></div><textarea aria-label="Exact referral email to the hiring manager" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-5 min-h-72 w-full rounded-xl border border-slate-200 bg-[#FCFCFE] p-4 font-mono text-sm leading-6 outline-none focus:border-violet-500" /><button type="button" onClick={() => navigator.clipboard?.writeText(email)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><Copy className="h-4 w-4" />Copy email</button></section><aside className="rounded-[28px] bg-slate-950 p-7 text-white"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">Your Referrer wallet</p><p className="mt-2 text-4xl font-semibold">{total}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white/10 p-3"><p className="font-semibold">{free}</p><p className="text-[10px] uppercase text-slate-400">Free</p></div><div className="rounded-xl bg-white/10 p-3"><p className="font-semibold">{paid}</p><p className="text-[10px] uppercase text-slate-400">Purchased</p></div></div><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional note to the Job Seeker" className="mt-5 min-h-24 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white" /><label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/25 p-3 text-xs text-slate-300"><Paperclip className="h-4 w-4" />Attach a helpful document<input type="file" className="hidden" /></label><button disabled={!total} onClick={() => decide(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold disabled:opacity-40">Use 1 token & approve <Send className="h-4 w-4" /></button>{!total && <Link href="/premium?role=referrer" className="mt-3 block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950">Buy more · $1 each</Link>}<button onClick={() => decide(false)} className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold">Decline respectfully</button></aside></div></div></main>;
}
