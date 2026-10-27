import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalFilterChip } from "@/components/goal";
import { RequestsAlert, RequestsLoading } from "@/components/requests/RequestStates";
import { LOAD_ERROR, fetchMyRequests } from "@/components/requests/requestsApi";
import { DEFAULT_THANK_YOU, UNDELIVERED_ERROR, hiresOf, referrerGreeting, sendLandedJourney } from "@/components/landed/landedModel";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { THANK_YOU_MAX_LENGTH, type LandedJourneyRequest, type PayForwardChoice } from "@shared/landedJourney";

/**
 * Goal /landed (D-048-p3-seeker-small, dark): one task at a time - celebrate,
 * thank, pay it forward - with the goal line first and one commit per view.
 * Data and delivery stay on the kit's landed model (read-only).
 */
export default function GoalLanded() {
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

  const shell = (children: React.ReactNode) => (
    <main data-skipwait-screen="landed" data-testid="goal-landed" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">Close the loop on your new role.</h1>
      </header>
      {children}
    </main>
  );

  if (!isLoaded) return shell(<div className="mx-4 my-5 gdesk:mx-5"><RequestsLoading slow={false} /></div>);

  if (!isSignedIn) {
    return <main data-skipwait-screen="landed-sign-in" data-testid="goal-landed" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">Close the loop on your new role.</h1>
        <p className="mt-2 text-g-meta text-g-ink-2">Someone helped you land it. Sign in to find the referral request and send your thank-you.</p>
      </header>
      <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <div className="mt-4"><SignInButton><GoalButton variant="primary" asChild><button type="button">Secure sign in</button></GoalButton></SignInButton></div>
      </section>
    </main>;
  }

  if (showSkeleton) return shell(<div className="mx-4 my-5 gdesk:mx-5"><RequestsLoading slow={isSlow} /></div>);
  const loadError = requestsQuery.isError && !requestsQuery.isFetching ? requestsQuery.error.message : "";
  if (loadError) return shell(<div className="mx-4 my-5 gdesk:mx-5"><RequestsAlert title={LOAD_ERROR} detail={loadError} reassurance="Nothing was lost - your referral requests and this thank-you wait for you." retryLabel="Try again" onRetry={() => { void requestsQuery.refetch(); }} dismissLabel="Back to requests" onDismiss={() => window.location.assign("/requests")} /></div>);
  if (!hire) {
    return shell(<section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Your next step</h2>
      <p className="mt-2 text-g-label text-g-ink">No hires to thank yet.</p>
      <p className="mt-1 text-g-meta text-g-ink-2">When the referrer marks your referral request as hired, this journey opens with their name on it.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" asChild><Link href="/explore">Explore companies</Link></GoalButton>
        <GoalButton variant="ghost" asChild><Link href="/requests">My requests</Link></GoalButton>
      </div>
    </section>);
  }

  const greeting = referrerGreeting(hire.referrerName);
  const company = hire.companyName ?? hire.companyDomain;

  return shell(<>
    {sendError ? <p role="alert" className="mx-4 mb-4 mt-4 text-g-meta text-g-crimson gdesk:mx-5">{sendError}</p> : null}

    {step === 0 ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">You did it.</h2>
      <p className="mt-2 text-g-label text-g-ink">{hire.title ?? "The role"} · {company}</p>
      <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
        <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
        <span>You did the work. {greeting} opened the door.</span></p>
      <div className="mt-4"><GoalButton variant="primary" onClick={() => setStep(1)}>Thank your referrer</GoalButton></div>
    </section> : null}

    {step === 1 ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Say thanks to {greeting}.</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">The single message referrers remember most.</p>
      <textarea aria-label="Thank-you message" value={message} maxLength={THANK_YOU_MAX_LENGTH} onChange={event => setMessage(event.target.value)}
        className="mt-4 min-h-36 w-full rounded-g-tile border border-g-hairline bg-transparent p-4 text-g-label text-g-ink" />
      <div className="mt-3"><GoalFilterChip label={`Let ${greeting} keep this on their private thank-you wall`} pressed={shareOnWall} onPressedChange={pressed => setShareOnWall(pressed)} /></div>
      <p className="mt-2 text-g-meta text-g-ink-3">That wall is visible only to them. Gifts or payments for referrals are not allowed on skipwait.me. A real thank-you is enough.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" busy={send.isPending} disabledReason={message.trim() ? undefined : "Write your thank-you first"} onClick={thanks}>{send.isPending ? "Sending…" : "Send thanks"}</GoalButton>
        <button type="button" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink" onClick={() => setStep(2)}>Skip</button>
      </div>
    </section> : null}

    {step === 2 ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Hold the door for the next person.</h2>
      <p className="mt-2 text-g-meta text-g-ink-2">Once you have your new work email, verify in 30 seconds and refer people you believe in, at your own pace. Passing is private and always okay.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" busy={send.isPending} onClick={() => choose("yes")}>Yes, I will pay it forward</GoalButton>
        <button type="button" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink" disabled={send.isPending} onClick={() => choose("later")}>Maybe later</button>
      </div>
      <p className="mt-3 text-g-meta text-g-ink-3">Choose Maybe later and we will not message you about it.</p>
      <p className="mt-3"><Link href="/explore" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Back to skipwait.me</Link></p>
    </section> : null}

    {step === 3 ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">{payForward === "yes" ? "Welcome to the other side of the door." : "Done."}</h2>
      <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
        <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
        <span>{payForward === "later" ? "No reminders from us. Verify whenever you are ready." : "Verify your new work email whenever you are ready."}</span></p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" asChild><Link href="/verify">Verify work email</Link></GoalButton>
        <GoalButton variant="ghost" asChild><Link href="/requests">Close my other referral requests</Link></GoalButton>
      </div>
    </section> : null}
  </>);
}
