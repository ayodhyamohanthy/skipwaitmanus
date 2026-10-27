import { ArrowRight, BadgeCheck, Check, DoorOpen, Gift, Heart, PartyPopper, Send } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { RequestsAlert, RequestsLoading } from "@/components/requests/RequestStates";
import { LOAD_ERROR, fetchMyRequests } from "@/components/requests/requestsApi";
import { DEFAULT_THANK_YOU, UNDELIVERED_ERROR, hiresOf, referrerGreeting, sendLandedJourney } from "@/components/landed/landedModel";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { THANK_YOU_MAX_LENGTH, type LandedJourneyRequest, type PayForwardChoice } from "@shared/landedJourney";
import { lazy, Suspense } from "react";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
const GoalLanded = lazy(() => import("./goal/seeker-small/GoalLanded"));

const STEPS = ["Celebrate", "Thank", "Pay it forward", "Done"] as const;
const PAY_IT_FORWARD = [
  ["You choose every request", "Passing is private and always okay."],
  ["Set your own capacity", "Even 1 request a month helps."],
  ["Stay anonymous", "Until you accept."],
] as const;

/**
 * Kit landed journey (app/src/routes/landed.tsx) on live data: the hire, the referrer's
 * name and the role line all come from the seeker's own asks, and an ask only appears
 * here once its referrer has marked it "Referred". The thank-you is sent from this page
 * into the private conversation (server/db.ts recordLandedJourney delivers it once), so
 * nothing is invented and nothing is copied-and-hoped-for.
 */
export default function Landed() {
  if (goalSurfaceOn("landed")) return <Suspense fallback={null}><GoalLanded /></Suspense>;
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const requested = Number(new URLSearchParams(useSearch()).get("request"));
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState(DEFAULT_THANK_YOU);
  const [shareOnWall, setShareOnWall] = useState(true);
  const [payForward, setPayForward] = useState<PayForwardChoice | null>(null);
  const [sendError, setSendError] = useState("");

  const requestsQuery = useQuery({ queryKey: ["requests", "mine", userId ?? "session"], enabled: isSignedIn, retry: false, queryFn: () => fetchMyRequests(fetchToken) });
  const hires = useMemo(() => hiresOf(requestsQuery.data?.requests ?? []), [requestsQuery.data]);
  const hire = hires.find(item => item.id === requested) ?? hires[0] ?? null;
  const send = useMutation({ mutationFn: (input: LandedJourneyRequest) => sendLandedJourney(fetchToken, input) });

  const loading = isSignedIn && (requestsQuery.isPending || (requestsQuery.isError && requestsQuery.isFetching));
  const { showSkeleton, isSlow } = useSlowLoad(loading);
  const thanks = () => {
    if (!hire) return;
    setSendError("");
    send.mutate({ referralRequestId: hire.id, message, shareOnWall }, {
      onSuccess: state => { if (state.delivered) setStep(2); else setSendError(UNDELIVERED_ERROR); },
      onError: reason => setSendError(reason instanceof Error ? reason.message : UNDELIVERED_ERROR),
    });
  };
  const choose = (choice: PayForwardChoice) => {
    if (!hire) return;
    setSendError("");
    send.mutate({ referralRequestId: hire.id, payForward: choice }, {
      onSuccess: () => { setPayForward(choice); setStep(3); },
      onError: reason => setSendError(reason instanceof Error ? reason.message : "We could not save that choice. Try again."),
    });
  };

  const frame = (children: ReactNode) => (
    <main data-skipwait-screen="landed" className="page-content">
      <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Landed journey">
        {STEPS.map((label, index) => (
          <li key={label}><span className={`block h-1.5 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 block text-xs text-muted-foreground">{label}</span></li>
        ))}
      </ol>
      {children}
    </main>
  );

  if (!isLoaded) return frame(<RequestsLoading slow={false} />);

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="landed-sign-in" className="page-content">
        <Panel tone="muted" className="text-center">
          <Heart className="mx-auto mb-3 size-8 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-semibold">Someone helped you land it.</h1>
          <p className="mt-2 text-muted-foreground">Sign in to find the ask and send your thank-you.</p>
          <div className="mt-5 flex justify-center"><SignInButton><button type="button" className={buttonVariants()}>Secure sign in <ArrowRight /></button></SignInButton></div>
        </Panel>
      </main>
    );
  }

  if (showSkeleton) return frame(<RequestsLoading slow={isSlow} />);
  const loadError = requestsQuery.isError && !requestsQuery.isFetching ? requestsQuery.error.message : "";
  if (loadError) return frame(<RequestsAlert title={LOAD_ERROR} detail={loadError} reassurance="Nothing was lost — your asks and this thank-you wait for you." retryLabel="Try again" onRetry={() => { void requestsQuery.refetch(); }} dismissLabel="Back to requests" onDismiss={() => window.location.assign("/requests")} />);
  if (!hire) {
    return frame(
      <Panel tone="muted" className="text-center">
        <h2 className="text-lg font-semibold">No hires to thank yet.</h2>
        <p className="mt-1 text-sm text-muted-foreground">When the referrer marks an ask as hired, this journey opens with their name on it.</p>
        <div className="mt-4 flex justify-center gap-2"><Button variant="outline" asChild><Link href="/requests">My requests</Link></Button><Button asChild><Link href="/explore">Explore companies</Link></Button></div>
      </Panel>,
    );
  }

  const greeting = referrerGreeting(hire.referrerName);
  const company = hire.companyName ?? hire.companyDomain;

  return frame(
    <>
      {sendError ? <p role="alert" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{sendError}</p> : null}

      {step === 0 ? (
        <section className="text-center">
          <span className="mx-auto grid size-24 place-items-center rounded-full bg-accent"><PartyPopper className="size-12 text-primary" /></span>
          <h1 className="mt-6 text-4xl font-semibold">You did it.</h1>
          <p className="mt-2 text-muted-foreground">{hire.title ?? "The role"} · {company}</p>
          <p className="mt-3 text-muted-foreground">You did the work. {greeting} opened the door. Let&apos;s close the loop kindly.</p>
          <Button className="mt-8" onClick={() => setStep(1)}>Thank your referrer <ArrowRight /></Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <Heart className="mb-3 text-primary" />
          <h1 className="text-3xl font-semibold">Say thanks to {greeting}.</h1>
          <p className="mt-2 text-muted-foreground">The single message referrers remember most.</p>
          <textarea aria-label="Thank-you message" value={message} maxLength={THANK_YOU_MAX_LENGTH} onChange={event => setMessage(event.target.value)} className="mt-6 min-h-36 w-full rounded-2xl border border-input bg-background p-4 text-base" />
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={shareOnWall} onChange={event => setShareOnWall(event.target.checked)} className="mt-1 size-4" />
            <span><strong className="block">Let {greeting} keep this on their private thank-you wall</strong><small className="text-muted-foreground">That wall is visible only to them, and shows your name with the role title. Untick to keep this note between you two.</small></span>
          </label>
          <Panel tone="muted" className="mt-6 text-sm"><Gift className="mb-2 size-5" />Gifts or payments for referrals aren&apos;t allowed on skipwait.me. A real thank-you is enough.</Panel>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>Skip</Button>
            <Button disabled={send.isPending || !message.trim()} onClick={thanks}><Send />{send.isPending ? "Sending…" : "Send thanks"}</Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <DoorOpen className="mb-3 text-primary" />
          <h1 className="text-3xl font-semibold">Hold the door for the next person.</h1>
          <p className="mt-2 text-muted-foreground">Once you have your new work email, verify in 30 seconds and refer people you believe in — at your own pace.</p>
          <div className="mt-6 grid gap-3">
            {PAY_IT_FORWARD.map(([title, hint]) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-border p-4"><BadgeCheck className="size-5 shrink-0 text-primary" /><span><strong className="block">{title}</strong><small className="text-muted-foreground">{hint}</small></span></div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Choose “Maybe later” and we won&apos;t message you about it.</p>
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <Button variant="outline" asChild><Link href="/explore">Back to skipwait.me</Link></Button>
            <span className="flex gap-2">
              <Button variant="ghost" disabled={send.isPending} onClick={() => choose("later")}>Maybe later</Button>
              <Button disabled={send.isPending} onClick={() => choose("yes")}>Yes, I&apos;ll pay it forward</Button>
            </span>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="text-center">
          <Check className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 text-3xl font-semibold">{payForward === "yes" ? "Welcome to the other side of the door." : "Done."}</h1>
          <p className="mt-2 text-muted-foreground">{payForward === "later" ? "No reminders from us. Verify whenever you're ready." : "Verify your new work email whenever you're ready."}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" asChild><Link href="/requests">Close my other asks</Link></Button>
            <Button asChild><Link href="/verify">Verify work email <ArrowRight /></Link></Button>
          </div>
        </section>
      ) : null}
    </>,
  );
}
