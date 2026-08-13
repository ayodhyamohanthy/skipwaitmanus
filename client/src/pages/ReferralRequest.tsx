import { CheckCircle2, FileText, Paperclip } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Brand } from "@/components/Brand";

export default function ReferralRequest() {
  const targetUrl = localStorage.getItem("bridge-target-url") || "your job link";
  const [tokens, setTokens] = useState(() => Number(localStorage.getItem("bridge-tokens") || 3));
  const [file, setFile] = useState<File | null>(null);
  const choose = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (!selectedFile) return;
    localStorage.setItem("bridge-seeker-attachment-name", selectedFile.name);
    localStorage.setItem("bridge-seeker-attachment-type", selectedFile.type);
    const reader = new FileReader();
    reader.onload = () => localStorage.setItem("bridge-seeker-attachment-url", String(reader.result));
    reader.readAsDataURL(selectedFile);
  };
  return <main className="min-h-screen bg-[#FCFCFE] px-6 py-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-[28px] bg-white p-8 text-center shadow-[0_20px_55px_rgba(31,25,72,.08)]"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-3xl font-semibold">Request sent.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your Referrer now has the job link and can write the email.</p><div className="mt-6 rounded-xl border border-dashed border-slate-300 p-3 text-left"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-600"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><Paperclip className="h-4 w-4" /></span>{file ? <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{file.name}</span> : "Add resume (optional)"}<input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => choose(event.target.files?.[0] || null)} /></label></div><div className="mt-6 rounded-xl bg-slate-950 p-4 text-left text-white"><p className="text-xs font-bold uppercase tracking-[.14em] text-violet-300">Application tokens</p><div className="mt-1 flex items-center justify-between"><p className="text-3xl font-semibold">{tokens}</p><Link href="/premium" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950">Add tokens · $1 each</Link></div></div><Link href="/referrer" className="mt-6 inline-flex text-sm font-semibold text-violet-700">See Referrer view</Link></section></div></main>;
}
