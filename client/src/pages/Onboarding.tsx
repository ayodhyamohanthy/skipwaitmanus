import { ArrowRight, FileText, Mail, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Brand } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { isValidTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

export default function Onboarding() {
  const [, go] = useLocation();
  const [name] = useState(() => readReferralDraft()?.name || "");
  const [targetUrl, setTargetUrl] = useState(() => readReferralDraft()?.targetUrl || "");
  const validTargetUrl = isValidTargetRoleUrl(targetUrl);
  const showTargetUrlError = Boolean(targetUrl.trim()) && !validTargetUrl;
  useEffect(() => { saveReferralDraft({ name, targetUrl }); }, [name, targetUrl]);
  const begin = () => { if (!validTargetUrl) return; const normalizedTargetUrl = targetUrl.trim(); localStorage.setItem("bridge-name", name || localStorage.getItem("bridge-name") || "Candidate"); localStorage.setItem("bridge-target-url", normalizedTargetUrl); saveReferralDraft({ name, targetUrl: normalizedTargetUrl }); go("/request"); };

  return <main data-skipwait-screen="onboarding" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950 sm:h-auto sm:min-h-screen sm:overflow-visible sm:px-6 sm:py-6"><div className="mx-auto flex h-full max-w-xl flex-col"><div className="flex h-10 shrink-0 items-center justify-between gap-3"><Brand /><AccountMenu /></div><section className="flex flex-1 flex-col justify-center"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Step 1 of 3 · Referral request</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em] text-slate-950 sm:text-5xl">Paste the job link.</h1><p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">We will match it privately to the company. Your resume comes next.</p><label className="mt-8 block text-sm font-semibold text-slate-800">Target Role URL<input autoFocus type="url" autoComplete="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://company.com/careers/role" aria-invalid={showTargetUrlError} aria-describedby={showTargetUrlError ? "target-url-error" : undefined} className={`mt-2 w-full rounded-xl border bg-white px-4 py-3.5 font-normal outline-none transition focus:ring-4 focus:ring-blue-50 ${showTargetUrlError ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#0B57D0]"}`} />{showTargetUrlError && <span id="target-url-error" role="alert" className="mt-2 block text-xs font-medium text-rose-700">{TARGET_ROLE_URL_ERROR}</span>}</label></div></section><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{showTargetUrlError && <p id="continue-hint" className="mb-2 flex items-center justify-center gap-1 text-xs font-semibold text-rose-700">Fix the link above to continue <ArrowRight className="h-3.5 w-3.5 rotate-90" /></p>}<button disabled={!validTargetUrl} aria-describedby={showTargetUrlError ? "continue-hint" : undefined} onClick={begin} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD] disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight className="h-4 w-4" /></button></footer></div></main>;
}
