// The poster's own openings (D-022 referrer-posted roles): every role they
// posted, live, lapsed or closed, each with one-tap renew and close. The list
// is owner-only by construction (GET /api/opportunities/mine), and every action
// refreshes the list so the state line always comes from the server, never from
// a local guess.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { Brand } from "@/components/Brand";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { closeCompanyOpportunity, companyOpportunityKeys, fetchMyOpportunities, renewCompanyOpportunity, type OwnerOpportunityPost } from "@/lib/companyOpportunities";
import { formatDay } from "@/lib/displayPrefs";

const ACTION_ERROR = "We could not update that opening. Try again in a moment.";

/** Live until <day> · Lapsed <day> · Closed — from the server's own facts. */
function stateOf(post: OwnerOpportunityPost): { label: string; tone: string } {
  const until = formatDay(post.expiresAt, { year: true });
  if (!post.isActive) return { label: "Closed", tone: "bg-[#f5f5f5] text-[#505050]" };
  if (post.expired) return { label: until ? `Lapsed ${until}` : "Lapsed", tone: "bg-[#b45309]/10 text-[#b45309]" };
  return { label: until ? `Live until ${until}` : "Live", tone: "bg-[#15803d]/10 text-[#15803d]" };
}

export default function MyOpenings({ onBack }: { onBack: () => void }) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const openings = useQuery({ queryKey: companyOpportunityKeys.mine(userId ?? null), queryFn: () => fetchMyOpportunities(getToken), enabled: isLoaded && isSignedIn, retry: 1 });
  const posts = openings.data ?? [];

  const run = async (post: OwnerOpportunityPost, action: "renew" | "close") => {
    setBusyId(post.id); setActionError("");
    try {
      if (action === "renew") await renewCompanyOpportunity(post.id, getToken);
      else await closeCompanyOpportunity(post.id, getToken);
      await queryClient.invalidateQueries({ queryKey: companyOpportunityKeys.mine(userId ?? null) });
    } catch (reason) {
      setActionError(reason instanceof Error && reason.message ? reason.message : ACTION_ERROR);
    } finally { setBusyId(null); }
  };

  return <main data-skipwait-screen="my-openings" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col">
    <header className="flex h-10 shrink-0 items-center justify-between"><Brand /><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</button></header>
    <div className="shrink-0 pt-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Your openings</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">Roles you posted.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Each role stays live for 30 days on your company’s page. Renew it in one tap, or close it once it is filled.</p></div>
    <section className="min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
      {openings.isPending ? <LoadingNote>Loading your openings…</LoadingNote> : openings.isError ? <ActionErrorCard title="We couldn’t load your openings" detail={openings.error.message || "Check your connection and try again."} reassurance="Nothing changed. Your openings are still there." onRetry={() => { void openings.refetch(); }} retrying={openings.isFetching} /> : posts.length === 0 ? <div className="flex flex-col items-start rounded-xl border border-[#e5e5e5] p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f5f5f5] text-black"><BriefcaseBusiness className="h-5 w-5" /></span><h2 className="mt-4 text-base font-bold">No roles yet.</h2><p className="mt-1 text-sm leading-6 text-[#505050]">Share a role with candidates and it appears on your company’s page for 30 days.</p><button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#141414] px-4 py-2.5 text-sm font-bold text-white">Share a role <ArrowRight className="h-4 w-4" /></button></div> : posts.map(post => {
        const state = stateOf(post);
        const posted = formatDay(post.postedAt, { year: true });
        const walkIn = post.kind === "walk_in" && post.walkInAt ? formatDay(post.walkInAt) : null;
        return <article key={post.id} className="mt-3 rounded-xl border border-[#e5e5e5] p-4 first:mt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[#505050]">{post.kind === "walk_in" ? <CalendarDays className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}{post.kind === "walk_in" ? "Walk-in" : "Hiring now"}</p>
              <h2 className="mt-2 text-base font-bold">{post.roleTitle}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#505050]">{post.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{post.location}</span> : null}{walkIn ? <span>Walk-in · {walkIn}</span> : null}{posted ? <span>Posted {posted}</span> : null}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${state.tone}`}>{state.label}</span>
          </div>
          <div className="mt-4 flex gap-2">
            {post.renewable ? <button type="button" disabled={busyId === post.id} onClick={() => { void run(post, "renew"); }} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#141414] px-4 py-2.5 text-sm font-bold text-white">{busyId === post.id ? "Renewing…" : "Renew 30 days"}</button> : null}
            {post.isActive && !post.expired ? <button type="button" disabled={busyId === post.id} onClick={() => { void run(post, "close"); }} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e5e5e5] px-4 py-2.5 text-sm font-bold text-[#505050]">{busyId === post.id ? "Closing…" : "Close"}</button> : null}
          </div>
        </article>;
      })}
      {actionError ? <p role="alert" className="mt-3 rounded-lg bg-[#b91c1c]/10 p-3 text-sm text-[#b91c1c]">{actionError}</p> : null}
    </section>
  </div></main>;
}
