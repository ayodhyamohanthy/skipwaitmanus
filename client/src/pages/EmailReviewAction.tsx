import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { WorkEmailSignIn } from "@/components/WorkEmailSignIn";
import { readApiJson } from "@/lib/apiResponse";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";

/*
 * D-035: the email review page offers the same seven pass reasons as the dashboard, sends the code
 * with the legacy reason it maps to, and never shows a credit effect (D-066 (4)). Nothing is
 * preselected, and "Pass privately" stays disabled until a reason is picked.
 */

type Decision = "approved" | "declined";
const legacyOf = (code: PassReasonCode) => PASS_REASON_OPTIONS.find(option => option.code === code)?.legacy ?? "cannot_support";

export default function EmailReviewAction() {
  const [, params] = useRoute("/email-review/:linkToken");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [state, setState] = useState<"loading" | "review" | "approved" | "passed" | "error">("loading");
  const [error, setError] = useState("");
  const [ethicsConfirmed, setEthicsConfirmed] = useState(false);
  const [reasonCode, setReasonCode] = useState<PassReasonCode | null>(null);
  useEffect(() => { getTokenRef.current = getToken }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !params?.linkToken) return;
    let active = true;
    void (async () => {
      try {
        const token = await getTokenRef.current();
        const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ review?: { ready?: boolean }; error?: string }>(response, "This private review link is unavailable");
        if (!response.ok || !payload.review?.ready) throw new Error(payload.error || "This private review link is unavailable");
        if (active) setState("review");
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : "This private review link is unavailable"); setState("error"); }
      }
    })();
    return () => { active = false };
  }, [isSignedIn, params?.linkToken]);

  const decide = async (decision: Decision, code?: PassReasonCode) => {
    setState("loading");
    try {
      const token = await getTokenRef.current();
      const body = { decision, ...(decision === "approved" ? { ethicsConfirmed: true } : {}), ...(code ? { declineReason: legacyOf(code), passReason: code } : {}) };
      const response = await fetch(`/api/referrer-review-links/${encodeURIComponent(params!.linkToken)}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await readApiJson<{ status?: string; error?: string }>(response, "This private review link is unavailable");
      if (!response.ok || !payload.status) throw new Error(payload.error || "This private review link is unavailable");
      setState(payload.status === "approved" ? "approved" : "passed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This private review link is unavailable");
      setState("error");
    }
  };

  if (!params?.linkToken) return <Unavailable />;
  if (!isSignedIn) return <Frame><LockKeyhole className="mx-auto h-6 w-6" /><h1 className="mt-4 text-2xl font-semibold">Use your company email.</h1><p className="mt-3 text-sm text-[#505050]">Sign in with the verified work email that received this notification.</p><div className="mt-6"><WorkEmailSignIn compact /></div></Frame>;
  if (state === "loading") return <Frame><h1 className="text-2xl font-semibold">Opening private review…</h1><p className="mt-3 text-sm text-[#505050]">No decision is recorded until you press a confirmation button.</p></Frame>;
  if (state === "error") return <Frame><XCircle className="mx-auto h-7 w-7" /><h1 className="mt-4 text-2xl font-semibold">Review link unavailable</h1><p role="alert" className="mt-3 text-sm text-[#505050]">{error}</p></Frame>;
  if (state === "review") return <Frame>
    <h1 className="text-2xl font-semibold">Choose your decision.</h1>
    <p className="mt-3 text-sm text-[#505050]">Each button records the named action immediately.</p>
    <p className="mt-4 text-left text-sm text-[#505050]">Accepting shares names both ways and the Job Seeker&rsquo;s resume. Referring comes later, through your company&rsquo;s own process.</p>
    <label className="mt-3 flex items-start gap-3 text-left text-sm"><input type="checkbox" checked={ethicsConfirmed} onChange={event => setEthicsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />I&rsquo;ll refer only through my company&rsquo;s official process and won&rsquo;t accept anything in return.</label>
    <button onClick={() => void decide("approved")} disabled={!ethicsConfirmed} className="mt-4 w-full rounded-lg bg-[#141414] p-3 text-sm font-bold text-white disabled:opacity-40">Accept &amp; connect</button>
    <fieldset className="mt-4 text-left">
      <legend className="text-sm font-semibold">Why are you passing?</legend>
      <p className="mt-1 text-sm text-[#505050]">Pick one. The Job Seeker sees the reason, never your name, and their ask stays open to other verified employees.</p>
      <div className="mt-2 grid gap-2">
        {PASS_REASON_OPTIONS.map(option => <button key={option.code} type="button" aria-pressed={reasonCode === option.code} onClick={() => setReasonCode(option.code)} className={`rounded-lg border p-3 text-left text-sm ${reasonCode === option.code ? "font-bold" : ""}`}>{option.label}</button>)}
      </div>
      <button type="button" onClick={() => { if (reasonCode) void decide("declined", reasonCode); }} disabled={!reasonCode} className="mt-3 w-full rounded-lg border p-3 text-sm font-bold disabled:opacity-40">Pass privately</button>
    </fieldset>
  </Frame>;
  const accepted = state === "approved";
  return <Frame>{accepted ? <CheckCircle2 className="mx-auto h-7 w-7 text-[#15803d]" /> : <XCircle className="mx-auto h-7 w-7" />}<h1 className="mt-4 text-2xl font-semibold">{accepted ? "Request accepted." : "Passed privately."}</h1>{accepted ? null : <p className="mt-3 text-sm text-[#505050]">The Job Seeker sees your reason without your name, and their ask stays open to other verified employees.</p>}<button onClick={() => go("/inbox")} className="mt-6 w-full rounded-lg bg-[#141414] p-3 text-sm font-bold text-white">Open My Company Inbox</button></Frame>;
}

function Frame({ children }: { children: React.ReactNode }) { return <main className="grid min-h-dvh place-items-center bg-white p-5 text-black"><section className="w-full max-w-xl rounded-2xl border border-[#e5e5e5] bg-white p-6 text-center">{children}</section></main> }
function Unavailable() { return <Frame><h1 className="text-2xl font-semibold">Review link unavailable</h1></Frame> }
