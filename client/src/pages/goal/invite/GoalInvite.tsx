// Goal /invite (D-048-p3-invite; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit invite page: one goal per mode, one commit per
// panel. "Request a company" is seeker demand (seeker sign-in); "Invite
// someone inside" is the referrer network (work-email OTP via
// referrerSignInHref only). Data/API modules are the kit's, imported read-only.
import { ArrowLeft, Building2, Check, Copy, Mail, Share2, UsersRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalTextInput } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { findListedCompanyByName, useCompanyDirectory } from "@/lib/companyDirectory";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { JOB_FUNCTIONS, parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import { fetchPersonalInviteCode, requestCompany, type TokenSource } from "@/components/referrer-home/referrerData";

type Mode = "request" | "invite";

const SHARE_TEXT = "Help job seekers at your company get private referrals on skipwait.me. Verify a work email to choose which requests you take.";

const MODE_COPY: Readonly<Record<Mode, { goal: string; sub: string }>> = {
  request: { goal: "Tell us where you want to work.", sub: "Your interest helps prioritize where to welcome verified referrers next. It does not create a referral request, and nothing is posted publicly." },
  invite: { goal: "Invite someone inside.", sub: "Share a neutral invitation. They choose whether to verify and open their door - no pressure, no referral obligation." },
};

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

function SignedOutPanel({ mode }: { mode: Mode }) {
  const copy = MODE_COPY[mode];
  return (
    <section aria-label={mode === "request" ? "Request a company" : "Personal invite link"} className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
      <Kicker>{mode === "request" ? "YOUR NEXT STEP" : "YOUR NEXT STEP"}</Kicker>
      <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">{mode === "request" ? "Sign in to send your request." : "Sign in to get your personal link."}</h2>
      <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">{mode === "request" ? "It does not create a referral request." : "They choose whether to verify and help."}</p>
      <div className="mt-5">
        {mode === "request"
          ? <SignInButton className="inline-flex h-(--g-control-h) items-center justify-center gap-2 rounded-g-control bg-g-ink px-[14px] text-g-label text-white">Sign in</SignInButton>
          : <GoalButton variant="primary" asChild><Link href={referrerSignInHref("/invite?mode=invite")}>Sign in with work email</Link></GoalButton>}
      </div>
      <p className="sr-only">{copy.goal}</p>
    </section>
  );
}

function RequestPanel({ fetchToken, onOtherPath }: { fetchToken: TokenSource; onOtherPath: () => void }) {
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies ?? [];
  const [company, setCompany] = useState("");
  const [jobFunction, setJobFunction] = useState<JobFunction | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const request = useMutation({ mutationFn: ({ name, jobFunction: fn }: { name: string; jobFunction: JobFunction | null }) => requestCompany(fetchToken, name, fn) });
  const name = company.trim();
  const listed = findListedCompanyByName(companies, name, "exact");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listed || request.isPending) return;
    if (name.length < 2) { setTooShort(true); return; }
    request.mutate({ name, jobFunction });
  };

  if (request.isSuccess) {
    return (
      <section aria-label="Request a company" className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
        <div role="status">
          <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink"><Check className="h-4 w-4" aria-hidden="true" />Saved</p>
          <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">That’s the growth loop.</h2>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">{request.data.alreadyRecorded
            ? `You had already asked for ${request.data.companyName}, so your vote counts once. It does not create a referral request, and nothing is posted publicly.`
            : `We saved your request for ${request.data.companyName}. It does not create a referral request, and nothing is posted publicly.`}</p>
          <div className="mt-5"><GoalButton variant="primary" onClick={onOtherPath}>Try the other path</GoalButton></div>
        </div>
      </section>
    );
  }

  return (
    <form aria-label="Request a company" onSubmit={submit} noValidate className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
      <Kicker>YOUR NEXT STEP</Kicker>
      <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Name the company you want on skipwait.me.</h2>
      <div className="mt-5 grid gap-4">
        <GoalField label="Company name" htmlFor="goal-invite-company" error={tooShort ? "Name the company you want to see." : undefined}>
          <GoalTextInput id="goal-invite-company" value={company} maxLength={160} onChange={event => { setCompany(event.target.value); setTooShort(false); if (request.isError) request.reset(); }} placeholder="Search or enter a company" list="goal-launch-companies" autoComplete="organization" invalid={tooShort} />
          <datalist id="goal-launch-companies">{companies.map(item => <option key={item.slug} value={item.name} />)}</datalist>
        </GoalField>
        <GoalField label="Work function" htmlFor="goal-invite-function">
          <select id="goal-invite-function" aria-label="Work function" value={jobFunction ?? ""} onChange={event => { setJobFunction(parseJobFunction(event.target.value)); if (request.isError) request.reset(); }} className="h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-white px-3 text-g-body text-g-ink outline-none focus:border-g-ink">
            <option value="">Choose a function</option>
            {JOB_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </GoalField>
        {directory.isError ? <p className="text-g-meta text-g-ink-3">We couldn’t load the companies already on skipwait.me, so suggestions are off. You can still send your request.</p> : null}
        {listed ? <p className="flex items-start gap-2 text-g-small text-g-ink-2"><Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{listed.name} already has a door on skipwait.me. <Link href={`/explore/${listed.slug}`} className="underline underline-offset-2 hover:text-g-ink">Open it</Link></span></p> : null}
        {request.isError ? <p role="alert" className="flex items-center gap-2 text-g-meta text-g-ink">{request.error.message || "We could not save this request. Try again."}</p> : null}
        <div><GoalButton variant="primary" type="submit" busy={request.isPending} busyLabel="Sending…">Send company request</GoalButton></div>
      </div>
    </form>
  );
}

function InvitePanel({ fetchToken, userId }: { fetchToken: TokenSource; userId: string | null }) {
  const invite = useQuery({ queryKey: ["personal-invite", userId], queryFn: () => fetchPersonalInviteCode(fetchToken), retry: 1, refetchOnWindowFocus: false });
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = invite.data ? `${origin}/verify?invite=${encodeURIComponent(invite.data)}` : "";
  const flash = () => { setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500); };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareOrCopy = async () => {
    if (!link) return;
    if (canShare) {
      try { await navigator.share({ title: "Join me on skipwait.me", text: SHARE_TEXT, url: link }); } catch { /* share sheet dismissed */ }
      return;
    }
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard unavailable: the link stays visible to copy by hand */ }
    flash();
  };

  return (
    <section aria-label="Personal invite link" className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
      <Kicker>YOUR NEXT STEP</Kicker>
      <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Send your personal link.</h2>
      {invite.isPending ? <p role="status" className="mt-4 text-g-small text-g-ink-2">Creating your personal link…</p> : invite.isError ? (
        <div className="mt-4">
          <p role="alert" className="text-g-meta text-g-ink">{invite.error.message || "We could not create your personal link. Try again."}</p>
          <div className="mt-4"><GoalButton variant="outline" busy={invite.isFetching} busyLabel="Trying again…" onClick={() => { void invite.refetch(); }}>Try again</GoalButton></div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-g-control border border-g-control-edge px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-g-mono text-[13px] text-g-ink">{link.replace(/^https?:\/\//, "")}</span>
            <GoalButton variant="ghost" size="xs" aria-label={canShare ? "Share invitation link" : "Copy invitation link"} onClick={() => { void shareOrCopy(); }}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : canShare ? <Share2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}</GoalButton>
          </div>
          {copied ? <p role="status" className="text-g-meta text-g-ink-3">Copied</p> : null}
          <div><GoalButton variant="primary" asChild leadingIcon={Mail}><a href={`mailto:?subject=${encodeURIComponent("Private referrals at your company")}&body=${encodeURIComponent(`${SHARE_TEXT} ${link}`)}`}>Email invite</a></GoalButton></div>
        </div>
      )}
    </section>
  );
}

export default function GoalInvite() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const fromReferrer = new URLSearchParams(useSearch()).get("mode") === "invite";
  const [mode, setMode] = useState<Mode>(fromReferrer ? "invite" : "request");
  const [round, setRound] = useState(0);
  const choose = (next: Mode) => { setMode(next); setRound(value => value + 1); };
  const copy = MODE_COPY[mode];

  return (
    <main data-skipwait-screen={isSignedIn ? "invite" : "invite-sign-in"} className="page-content bg-white font-g-sans text-g-ink">
      <Link className="inline-flex items-center gap-1.5 text-g-small font-medium text-g-ink-2 hover:text-g-ink" href={fromReferrer ? "/referrer-home" : "/explore"}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{fromReferrer ? "Back to referrer home" : "Back to explore"}</Link>
      <div className="mt-6 max-w-[640px]">
        <Kicker>{mode === "request" ? "SEEKER DEMAND" : "REFERRER NETWORK"}</Kicker>
        <h1 className="mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[40px]">{copy.goal}</h1>
        <p className="mt-3 text-g-body leading-[1.6] text-g-ink-2">{copy.sub}</p>
      </div>
      <div className="mt-6 grid max-w-[640px] grid-cols-2 gap-3" role="group" aria-label="Choose a path">
        {([["request", "Request a company", "Where you want to work", UsersRound], ["invite", "Invite someone inside", "A colleague who can help", Share2]] as const).map(([id, title, sub, Icon]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => choose(id)} className={`rounded-[10px] border p-4 text-left transition-colors ${mode === id ? "border-g-ink" : "border-g-hairline hover:border-g-control-edge"}`}>
            <Icon className="h-4 w-4 text-g-ink-2" aria-hidden="true" />
            <span className="mt-2 block text-g-small font-semibold">{title}</span>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-g-ink-3">{sub}</span>
            {mode === id ? <Check className="mt-2 h-4 w-4" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <div className="mt-6 max-w-[640px]">
        {!isSignedIn ? <SignedOutPanel mode={mode} /> : mode === "request"
          ? <RequestPanel key={round} fetchToken={fetchToken} onOtherPath={() => choose("invite")} />
          : <InvitePanel fetchToken={fetchToken} userId={userId ?? null} />}
      </div>
    </main>
  );
}
