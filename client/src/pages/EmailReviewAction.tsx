import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { WorkEmailSignIn } from "@/components/WorkEmailSignIn";
import { readApiJson } from "@/lib/apiResponse";

type Decision = "approved" | "declined";
type DeclineReason = "role_not_a_fit" | "cannot_support" | "timing";

export default function EmailReviewAction() {
  const [, params] = useRoute("/email-review/:linkToken");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const actionStartedRef = useRef(false);
  const [state, setState] = useState<"ready" | "working" | "approved" | "declined" | "error">("ready");
  const [error, setError] = useState("");
  const action = useMemo(() => {
    const search = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const decision = search.get("decision"); const reason = search.get("reason");
    if (decision === "approved") return { decision: "approved" as const };
    if (decision === "declined" && (reason === "role_not_a_fit" || reason === "cannot_support" || reason === "timing")) return { decision: "declined" as const, declineReason: reason as DeclineReason };
    return null;
  }, []);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !action || !params?.linkToken || actionStartedRef.current) return;
    actionStartedRef.current = true;
    let active = true; setState("working");
    void (async () => {
      try {
        const token = await getTokenRef.current();
        const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(action) });
        const payload = await readApiJson<{ status?: Decision; error?: string }>(response, "This private review link is unavailable");
        if (!response.ok || !payload.status) throw new Error(payload.error || "This private review link is unavailable");
        if (active) setState(payload.status);
      } catch (reason) { if (active) { setError(reason instanceof Error ? reason.message : "This private review link is unavailable"); setState("error"); } }
    })();
    return () => { active = false; };
  }, [action, isSignedIn, params?.linkToken]);
  if (!action || !params?.linkToken) return <Unavailable />;
  if (!isSignedIn) return <main data-skipwait-screen="email-review-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#E2DDD2] bg-white p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#E8F0FE] text-[#191713]"><LockKeyhole className="h-5 w-5" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#191713]">Private review</p><h1 className="mt-3 text-[2.15rem] font-semibold leading-[.98] tracking-[-.02em]">Use your company email.</h1><p className="mt-4 text-sm leading-6 text-[#625D52]">Sign in with the verified work email that received this notification. No candidate details are shown until access is confirmed.</p><div className="mt-6"><WorkEmailSignIn compact /></div></section></div></main>;
  if (state === "working" || state === "ready") return <main data-skipwait-screen="email-review-working" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#DBEAFE] bg-white p-6 text-center shadow-sm"><div className="mx-auto h-10 w-10 animate-pulse rounded-xl bg-[#DBEAFE]" /><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Recording your decision…</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">This is private and only available to your verified company account.</p></section></div></main>;
  if (state === "error") return <main data-skipwait-screen="email-review-unavailable" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#E2DDD2] bg-white p-6 text-center shadow-sm"><XCircle className="mx-auto h-7 w-7 text-[#625D52]" /><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Review link unavailable</h1><p role="alert" className="mt-2 text-sm leading-6 text-[#625D52]">{error || "This private review link may have expired or already been used."}</p><button type="button" onClick={() => go("/inbox")} className="mt-6 w-full rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white">Open My Company Inbox</button></section></div></main>;
  const accepted = state === "approved";
  return <main data-skipwait-screen="email-review-complete" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#DBEAFE] bg-white p-6 text-center shadow-sm"><span className={`mx-auto grid h-12 w-12 place-items-center rounded-xl ${accepted ? "bg-emerald-50 text-emerald-700" : "bg-[#ECE8DD] text-[#625D52]"}`}>{accepted ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}</span><p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#191713]">Private decision recorded</p><h1 className="mt-3 text-[2.15rem] font-semibold leading-[.98] tracking-[-.02em]">{accepted ? "Referral accepted." : "Request declined."}</h1><p className="mt-4 text-sm leading-6 text-[#625D52]">{accepted ? "You can now continue privately with the Job Seeker." : "Your concise update was shared privately with the Job Seeker."}</p><button type="button" onClick={() => go(accepted ? "/inbox" : "/inbox")} className="mt-6 w-full rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white">Open My Company Inbox</button></section></div></main>;
}

function Unavailable() { return <main className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#E2DDD2] bg-white p-6 text-center shadow-sm"><XCircle className="mx-auto h-7 w-7 text-[#625D52]" /><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Review link unavailable</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">This private review action is invalid or has expired.</p></section></div></main>; }
