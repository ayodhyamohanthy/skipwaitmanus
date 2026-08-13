import { CheckCircle2, ExternalLink, FileText, Paperclip, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Brand } from "@/components/Brand";

export default function ReferralRequest() {
  const targetUrl = localStorage.getItem("bridge-target-url") || "https://company.com/jobs/product-designer";
  const [tokens, setTokens] = useState(() => Number(localStorage.getItem("bridge-tokens") || 3));
  const [note, setNote] = useState("");
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
  const send = () => { setTokens(tokens - 1); localStorage.setItem("bridge-tokens", String(tokens - 1)); setSent(true); };

  if (sent) return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-[28px] bg-white p-9 text-center shadow-[0_20px_55px_rgba(31,25,72,.08)]"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-3xl font-semibold">Referral request sent.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Your Referrer will review your resume and target role. If they approve, they will personalize the referral email and send it to the hiring manager.</p><Link href="/referrer" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Preview Referrer view</Link></section></div></main>;

  return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-4xl"><Brand /><div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_20px_55px_rgba(31,25,72,.08)]"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">Direct referral request · 1 token</p><h1 className="mt-3 text-3xl font-semibold">Send your context. Let the Referrer handle the email.</h1><p className="mt-3 text-sm leading-6 text-slate-600">You don’t need to write a referral email. Give the employee enough context to make a thoughtful, personal recommendation.</p><a href={targetUrl} target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 rounded-xl bg-[#F8F8FC] p-3 text-sm font-medium text-violet-700"><ExternalLink className="h-4 w-4" /><span className="truncate">{targetUrl}</span></a><label className="mt-5 block text-sm font-semibold">A short note for the Referrer<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this role matters to you, or anything the Referrer should know." className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 bg-[#FCFCFE] p-4 text-sm font-normal leading-6 outline-none focus:border-violet-500" /></label><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><Paperclip className="h-4 w-4" /></span>{file ? <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{file.name}</span> : "Attach resume (PDF, PNG, JPG)"}<input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => choose(event.target.files?.[0] || null)} /></label><button disabled={tokens === 0} onClick={send} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Use 1 token & send request <Send className="h-4 w-4" /></button></section><aside className="rounded-[28px] bg-slate-950 p-7 text-white"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">Your application tokens</p><p className="mt-2 text-5xl font-semibold">{tokens}</p><p className="mt-2 text-sm leading-6 text-slate-400">One token sends one direct referral request for an employee to review.</p>{tokens === 0 && <Link href="/premium" className="mt-6 block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950">Buy more · $1 each</Link>}</aside></div></div></main>;
}
