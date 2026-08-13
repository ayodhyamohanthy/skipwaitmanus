import { CheckCircle2, Copy, ExternalLink, Mail, Paperclip, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Brand } from "@/components/Brand";

const achievementMarker = "[Add one evidence-based accomplishment below]";

export default function ReferralRequest() {
  const targetUrl = localStorage.getItem("bridge-target-url") || "https://company.com/jobs/product-designer";
  const candidate = localStorage.getItem("bridge-name") || "Avery";
  const [tokens, setTokens] = useState(() => Number(localStorage.getItem("bridge-tokens") || 3));
  const [accomplished, setAccomplished] = useState("");
  const [measuredBy, setMeasuredBy] = useState("");
  const [byDoing, setByDoing] = useState("");
  const initial = useMemo(
    () => `Subject: Referral — ${candidate} for the role at this posting

Hi [Hiring Manager Name],

I’d like to recommend ${candidate} for this opportunity: ${targetUrl}

Based on their background and the work I’ve seen from them, I believe they would be a strong candidate for the team. ${achievementMarker}

I’ve attached their resume for your review and am happy to share more context if helpful.

Best,
[Employee Name]`,
    [candidate, targetUrl],
  );
  const [email, setEmail] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [sent, setSent] = useState(false);

  const choose = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (!selectedFile) return;
    localStorage.setItem("bridge-seeker-attachment-name", selectedFile.name);
    localStorage.setItem("bridge-seeker-attachment-type", selectedFile.type);
    const reader = new FileReader();
    reader.onload = () => localStorage.setItem("bridge-seeker-attachment-url", String(reader.result));
    reader.readAsDataURL(selectedFile);
  };

  const addAchievement = () => {
    if (!accomplished.trim() || !measuredBy.trim() || !byDoing.trim()) return;
    const evidence = `For example, ${candidate} ${accomplished.trim()}, measured by ${measuredBy.trim()}, by ${byDoing.trim()}.`;
    setEmail((current) => current.includes(achievementMarker) ? current.replace(achievementMarker, evidence) : `${current}\n\n${evidence}`);
  };

  const copy = () => navigator.clipboard?.writeText(email);

  if (sent) return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-[28px] bg-white p-9 text-center shadow-[0_20px_55px_rgba(31,25,72,.08)]"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-3xl font-semibold">Referral email prepared.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Share this exact email and your attached resume with the employee. They can send it directly to the hiring manager.</p><Link href="/referrer" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Preview employee view</Link></section></div></main>;

  return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-5xl"><Brand /><div className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_.75fr]"><section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_20px_55px_rgba(31,25,72,.08)]"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">Employee referral email · 1 token</p><h1 className="mt-3 text-3xl font-semibold">Give the employee the exact email to send.</h1><a href={targetUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 rounded-xl bg-[#F8F8FC] p-3 text-sm font-medium text-violet-700"><ExternalLink className="h-4 w-4" /><span className="truncate">{targetUrl}</span></a><div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><p className="text-sm font-semibold text-violet-950">Make the recommendation credible</p><p className="mt-1 text-xs leading-5 text-violet-900">Use one specific achievement: <strong>accomplished X + measured by Y + by doing Z.</strong></p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">Accomplished X<input value={accomplished} onChange={(event) => setAccomplished(event.target.value)} placeholder="increased activation" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label><label className="text-xs font-semibold text-slate-700">Measured by Y<input value={measuredBy} onChange={(event) => setMeasuredBy(event.target.value)} placeholder="24% in one quarter" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label><label className="text-xs font-semibold text-slate-700">By doing Z<input value={byDoing} onChange={(event) => setByDoing(event.target.value)} placeholder="redesigning onboarding" className="mt-1.5 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-violet-500" /></label></div><button type="button" onClick={addAchievement} disabled={!accomplished || !measuredBy || !byDoing} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add to email</button></div><textarea aria-label="Exact employee referral email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-5 min-h-72 w-full rounded-xl border border-slate-200 bg-[#FCFCFE] p-4 font-mono text-sm leading-6 outline-none focus:border-violet-500" /><div className="mt-4 flex flex-wrap gap-3"><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600"><Paperclip className="h-4 w-4 text-violet-600" />{file ? file.name : "Attach resume (PDF, PNG, JPG)"}<input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => choose(event.target.files?.[0] || null)} /></label><button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><Copy className="h-4 w-4" />Copy email</button></div><button disabled={tokens === 0} onClick={() => { setTokens(tokens - 1); localStorage.setItem("bridge-tokens", String(tokens - 1)); setSent(true); }} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Use 1 token & prepare email <Send className="h-4 w-4" /></button></section><aside className="rounded-[28px] bg-slate-950 p-7 text-white"><Mail className="h-5 w-5 text-violet-300" /><p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-violet-300">Your application tokens</p><p className="mt-2 text-5xl font-semibold">{tokens}</p><p className="mt-2 text-sm leading-6 text-slate-400">One token prepares one ready-to-forward referral email.</p>{tokens === 0 && <Link href="/premium" className="mt-6 block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950">Buy more · $1 each</Link>}</aside></div></div></main>;
}
