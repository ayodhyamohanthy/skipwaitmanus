import { lazy, Suspense } from "react";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { WorkEmailSignIn } from "@/components/WorkEmailSignIn";
import { readApiJson } from "@/lib/apiResponse";
import { isWorkEmailCodeRequired, notifyWorkEmailCodeRequired } from "@/lib/referrerStepUpApi";
type Decision="approved"|"declined"; type DeclineReason="role_not_a_fit"|"cannot_support"|"timing";
// D-057 (§0b.8b): `code_required` — the review link answered 403 work_email_code_required,
// so a signed-in person confirms their work email in place (the ordinary access verdict's
// step-up), never the standalone code sign-in, and the same link is retried afterwards.
type State="loading"|"review"|"approved"|"passed"|"error"|"code_required";

// The in-place step-up island is the goal module's named export, lazy so the kit page's
// happy path adds no goal chunk and no request (D-057 §0b.8b).
const StepUpIsland = lazy(() => import("./goal/email-review/GoalEmailReviewAction").then(m => ({ default: m.GoalEmailReviewStepUpIsland })));

function KitEmailReviewAction(){
  const[,params]=useRoute("/email-review/:linkToken");const[,go]=useLocation();const{isSignedIn,getToken}=useAuth();const getTokenRef=useRef(getToken);const[state,setState]=useState<State>("loading");const[error,setError]=useState("");const[ethicsConfirmed,setEthicsConfirmed]=useState(false);const pendingDecision=useRef<{decision:Decision;declineReason?:DeclineReason}|null>(null);
  useEffect(()=>{getTokenRef.current=getToken},[getToken]);
  const loadReview=async()=>{if(!isSignedIn||!params?.linkToken)return;setState("loading");try{const token=await getTokenRef.current();const response=await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}`,{credentials:"include",headers:token?{Authorization:`Bearer ${token}`}:{}});const payload=await readApiJson<{review?:{ready?:boolean};error?:string;code?:string}>(response,"This private review link is unavailable");if(isWorkEmailCodeRequired(response.status,payload)){notifyWorkEmailCodeRequired();setState("code_required");return;}if(!response.ok||!payload.review?.ready)throw new Error(payload.error||"This private review link is unavailable");setState("review")}catch(reason){setError(reason instanceof Error?reason.message:"This private review link is unavailable");setState("error")}};
  useEffect(()=>{void loadReview()},[isSignedIn,params?.linkToken]);
  const decide=async(decision:Decision,declineReason?:DeclineReason)=>{if(!params?.linkToken)return;setState("loading");try{const token=await getTokenRef.current();const response=await fetch(`/api/referrer-review-links/${encodeURIComponent(params.linkToken)}/decision`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({decision,...(decision==="approved"?{ethicsConfirmed:true}:{}) ,...(declineReason?{declineReason}:{})})});const payload=await readApiJson<{status?:string;error?:string;code?:string}>(response,"This private review link is unavailable");if(isWorkEmailCodeRequired(response.status,payload)){notifyWorkEmailCodeRequired();pendingDecision.current={decision,declineReason};setState("code_required");return;}if(!response.ok||!payload.status)throw new Error(payload.error||"This private review link is unavailable");setState(payload.status==="approved"?"approved":"passed")}catch(reason){setError(reason instanceof Error?reason.message:"This private review link is unavailable");setState("error")}};
  // D-057: after the in-session step-up confirms, the same review link (or the decision
  // the person explicitly pressed) is retried in place, for the same account.
  const resumeAfterStepUp=useCallback(()=>{const pending=pendingDecision.current;pendingDecision.current=null;if(pending)void decide(pending.decision,pending.declineReason);else void loadReview()},[isSignedIn,params?.linkToken]);
  if(!params?.linkToken)return <Unavailable/>;if(!isSignedIn)return <Frame><LockKeyhole className="mx-auto h-6 w-6"/><h1 className="mt-4 text-2xl font-semibold">Use your company email.</h1><p className="mt-3 text-sm text-[#505050]">Sign in with the verified work email that received this notification.</p><div className="mt-6"><WorkEmailSignIn compact/></div></Frame>;
  if(state==="code_required")return <Frame><h1 className="text-2xl font-semibold">Confirm your work email.</h1><p className="mt-3 text-sm text-[#505050]">One code keeps this review link on your account. No decision is recorded until you press a confirmation button.</p><Suspense fallback={<p className="mt-4 text-sm text-[#505050]">Checking your work email…</p>}><StepUpIsland onVerified={resumeAfterStepUp}/></Suspense></Frame>;
  if(state==="loading")return <Frame><h1 className="text-2xl font-semibold">Opening private review…</h1><p className="mt-3 text-sm text-[#505050]">No decision is recorded until you press a confirmation button.</p></Frame>;
  if(state==="error")return <Frame><XCircle className="mx-auto h-7 w-7"/><h1 className="mt-4 text-2xl font-semibold">Review link unavailable</h1><p role="alert" className="mt-3 text-sm text-[#505050]">{error}</p></Frame>;
  if(state==="review")return <Frame><h1 className="text-2xl font-semibold">Choose your decision.</h1><p className="mt-3 text-sm text-[#505050]">Each button records the named action immediately.</p><p className="mt-4 text-left text-sm text-[#505050]">Accepting shares names both ways and the Job Seeker&rsquo;s resume. Referring comes later, through your company&rsquo;s own process.</p><label className="mt-3 flex items-start gap-3 text-left text-sm"><input type="checkbox" checked={ethicsConfirmed} onChange={event=>setEthicsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0"/>I&rsquo;ll refer only through my company&rsquo;s official process and won&rsquo;t accept anything in return.</label><button onClick={()=>void decide("approved")} disabled={!ethicsConfirmed} className="mt-4 w-full rounded-lg bg-[#141414] p-3 text-sm font-bold text-white disabled:opacity-40">Accept &amp; connect</button><div className="mt-3 grid gap-2"><button onClick={()=>void decide("declined","role_not_a_fit")} className="rounded-lg border p-3 text-sm font-bold">Decline - role not a fit</button><button onClick={()=>void decide("declined","cannot_support")} className="rounded-lg border p-3 text-sm font-bold">Decline - can't support</button><button onClick={()=>void decide("declined","timing")} className="rounded-lg border p-3 text-sm font-bold">Decline - not now</button></div></Frame>;
  const accepted=state==="approved";return <Frame>{accepted?<CheckCircle2 className="mx-auto h-7 w-7 text-[#15803d]"/>:<XCircle className="mx-auto h-7 w-7"/>}<h1 className="mt-4 text-2xl font-semibold">{accepted?"Request accepted.":"Passed privately."}</h1>{accepted?null:<p className="mt-3 text-sm text-[#505050]">The Job Seeker sees your reason without your name, and their ask stays open to other verified employees.</p>}<button onClick={()=>go("/inbox")} className="mt-6 w-full rounded-lg bg-[#141414] p-3 text-sm font-bold text-white">Open My Company Inbox</button></Frame>}
function Frame({children}:{children:React.ReactNode}){return <main className="grid min-h-dvh place-items-center bg-white p-5 text-black"><section className="w-full max-w-xl rounded-2xl border border-[#e5e5e5] bg-white p-6 text-center">{children}</section></main>};function Unavailable(){return <Frame><h1 className="text-2xl font-semibold">Review link unavailable</h1></Frame>}

const GoalEmailReviewAction = lazy(() => import("./goal/email-review/GoalEmailReviewAction"));

export default function EmailReviewAction() {
  if (goalSurfaceOn("email-review")) {
    return (
      <Suspense fallback={null}>
        <GoalEmailReviewAction />
      </Suspense>
    );
  }
  return <KitEmailReviewAction />;
}
