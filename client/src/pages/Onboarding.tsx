import { ArrowRight, FileText, Mail, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Brand } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { getJobSeekerTokens } from "@/lib/tokens";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { isValidTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

export default function Onboarding() {
  const [, go] = useLocation();
  const [name, setName] = useState(() => readReferralDraft()?.name || "");
  const [targetUrl, setTargetUrl] = useState(() => readReferralDraft()?.targetUrl || "");
  const [tokens] = useState(getJobSeekerTokens);
  const validTargetUrl = isValidTargetRoleUrl(targetUrl);
  const showTargetUrlError = Boolean(targetUrl.trim()) && !validTargetUrl;
  useEffect(() => { saveReferralDraft({ name, targetUrl }); }, [name, targetUrl]);
  const begin = () => { if (!validTargetUrl) return; const normalizedTargetUrl = targetUrl.trim(); localStorage.setItem("bridge-name", name || "Avery"); localStorage.setItem("bridge-target-url", normalizedTargetUrl); saveReferralDraft({ name, targetUrl: normalizedTargetUrl }); go("/request"); };

  return <main data-skipwait-screen="onboarding" className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-3xl"><div className="flex items-center justify-between gap-3"><Brand /><div className="flex items-center gap-2"><span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 sm:inline">{tokens} tokens included</span><AccountMenu /></div></div><section className="mt-14 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Referral request</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.055em] text-slate-950">Start with the opportunity.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Share your name and the job link. Your resume comes next, then the Referrer reviews the request.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-800">Your first name<input autoFocus autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Avery" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-[#0B57D0] focus:ring-4 focus:ring-blue-50" /></label><label className="block text-sm font-semibold text-slate-800">Target Role URL<input type="url" autoComplete="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://company.com/careers/role" aria-invalid={showTargetUrlError} className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 font-normal outline-none transition focus:ring-4 focus:ring-blue-50 ${showTargetUrlError ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#0B57D0]"}`} />{showTargetUrlError && <span role="alert" className="mt-2 block text-xs font-medium text-rose-700">{TARGET_ROLE_URL_ERROR}</span>}</label></div><button disabled={!validTargetUrl || tokens === 0} onClick={begin} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD] disabled:opacity-40">Continue <ArrowRight className="h-4 w-4" /></button><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs"><span className="font-medium text-slate-500">1 token per request</span><span className="text-slate-400">More tokens · $1 each</span></div></section><div className="mt-5 grid gap-3 sm:grid-cols-3"><InfoCard icon={<UserRoundCheck className="h-4 w-4 text-[#0B57D0]" />} title="Clear context" body="The exact role frames the request." /><InfoCard icon={<FileText className="h-4 w-4 text-[#0B57D0]" />} title="Your evidence" body="Your resume is required next." /><InfoCard icon={<Mail className="h-4 w-4 text-[#0B57D0]" />} title="A human ask" body="The Referrer writes the email." /></div></div></main>;
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4">{icon}<p className="mt-3 text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{body}</p></div>; }
