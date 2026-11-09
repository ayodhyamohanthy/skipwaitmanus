// D-048-p3-employer-talent: the goal /employer/talent (packet
// docs/plans/D-048-employer.md §3). Same endpoints and flow as the kit page
// (client/src/pages/TalentDiscovery.tsx): list + search, unlock (402 restores
// the row and routes to billing), profile only for an unlocked row, intro
// through the platform. Talent privacy is server-ruled (§4 rule 2): this page
// renders only the fields the server returns and never relaxes a state.
// Display copy names what the money buys (a talent unlock) and never says
// "credit(s)" (rule 1a); internal field names stay unchanged.
import { Send, Unlock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalNextStep, GoalNum, GoalSkeletonRows, GoalStatus } from "@/components/goal";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { EmployerGoalFrame } from "../employer/EmployerGoalFrame";

export const GOAL_PAGE = { goalLine: "Meet opt-in talent." } as const;
// The kit page's own unlock cost (TalentDiscovery.tsx UNLOCK_CREDIT_COST, the
// server's EMPLOYER_UNLOCK_CREDIT_COST). Never retyped: talent.goal.test.tsx
// reads the kit source so a price change there fails here instead of drifting.
export const TALENT_UNLOCK_COST = 5;
// Narrowed to what the structured fields omit: the list and the unlocked
// snapshot carry no name or contact field, but the headline is free text the
// person wrote, so no promise is made about what it contains.
const PRIVACY_LINE = "No name or contact fields are listed; the headline is in this person's own words. Unlocking shows only the fields they chose to share, and they decide whether to respond.";
// The subtitle and the SEO description say the same: unlocking does show the
// fields the person chose to share, so no line claims every profile stays
// hidden until they respond.
const SUBTITLE = "Browse opt-in talent. Unlocking shows only the fields they chose to share, and they decide whether to respond.";

type TalentRow = { displayRef: string; headline: string | null; location: string | null; skills: string[]; isUnlocked: boolean };
// GET /api/employer/talent/:ref returns { profile: { ...talentSnapshot,
// unlockedAt, expiresAt } }: only the consented keys, expertise as string[],
// and no displayRef, so the page binds the profile to the row it requested.
type UnlockedProfile = { headline?: string | null; location?: string | null; skills?: string[]; experience?: string | null; expertise?: string[]; unlockedAt?: string; expiresAt?: string };
type OpenedProfile = { displayRef: string; profile: UnlockedProfile };

const inputClass = "h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3";

export default function GoalEmployerTalent() {
  const [, go] = useLocation();
  const [talent, setTalent] = useState<TalentRow[]>([]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Unlocks are serialized: one request at a time. The ref guards the handler
  // against re-entry before React re-renders; the state drives the UI (the
  // pending row shows Locked with no profile or intro action, every other
  // Unlock is inert) until that one request settles.
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const unlockInFlight = useRef<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [openedProfile, setOpenedProfile] = useState<OpenedProfile | null>(null);
  const listGeneration = useRef(0);
  const balanceChangedByUnlock = useRef(false);
  const [introSentTo, setIntroSentTo] = useState<string | null>(null);

  useEffect(() => {
    applySeo({ title: "Meet opt-in talent on skipwait.me", description: SUBTITLE, path: "/employer/talent" });
  }, []);

  const loadTalent = async (nextQuery = query, nextLocation = location) => {
    const generation = ++listGeneration.current;
    setOpenedProfile(null);
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (nextQuery.trim()) params.set("query", nextQuery.trim()); if (nextLocation.trim()) params.set("location", nextLocation.trim());
      const response = await fetch(`/api/employer/talent${params.size ? `?${params.toString()}` : ""}`, { credentials: "include" });
      const payload = await readApiJson<{ talent?: TalentRow[]; error?: string }>(response, "We could not load the talent list");
      if (!response.ok) throw new Error(payload.error || "We could not load the talent list");
      if (generation === listGeneration.current) setTalent(payload.talent || []);
    } catch (loadError) { if (generation === listGeneration.current) setError(loadError instanceof Error ? loadError.message : "We could not load the talent list"); }
    finally { if (generation === listGeneration.current) setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    const generation = ++listGeneration.current;
    void (async () => {
      try {
        const [talentResponse, accountResponse] = await Promise.all([fetch("/api/employer/talent", { credentials: "include" }), fetch("/api/employer/account", { credentials: "include" })]);
        const talentPayload = await readApiJson<{ talent?: TalentRow[]; error?: string }>(talentResponse, "We could not load the talent list");
        if (!talentResponse.ok) throw new Error(talentPayload.error || "Employer access is required");
        const accountPayload = await readApiJson<{ account?: { credits: number } | null }>(accountResponse, "Employer account unavailable");
        if (active) {
          if (generation === listGeneration.current) setTalent(talentPayload.talent || []);
          if (!balanceChangedByUnlock.current) setBalance(accountPayload.account?.credits ?? null);
        }
      } catch (loadError) { if (active && generation === listGeneration.current) setError(loadError instanceof Error ? loadError.message : "We could not load the talent list"); }
      finally { if (active && generation === listGeneration.current) setLoading(false); }
    })();
    return () => { active = false; listGeneration.current += 1; };
  }, []);

  const unlockTalent = async (row: TalentRow) => {
    if (unlockInFlight.current !== null) return;
    unlockInFlight.current = row.displayRef;
    balanceChangedByUnlock.current = true;
    listGeneration.current += 1;
    setLoading(false);
    setUnlockingId(row.displayRef);
    const previousBalance = balance;
    const previousUnlocked = row.isUnlocked;
    // Row-only rollback. On a 402 the body's numeric `credits` is the server's
    // balance; the captured one is used only when it carries no number.
    const restore = (serverBalance?: unknown) => {
      setBalance(typeof serverBalance === "number" && Number.isFinite(serverBalance) ? serverBalance : previousBalance);
      setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: previousUnlocked } : item));
    };
    setBalance(current => (current === null ? current : Math.max(0, current - TALENT_UNLOCK_COST)));
    setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: true } : item));
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}/unlock`, { method: "POST", credentials: "include" });
      const payload = await readApiJson<{ unlocked?: boolean; remaining?: number; credits?: unknown; error?: string }>(response, "We could not unlock this profile");
      if (response.status === 402) {
        restore(payload.credits);
        toast("Your talent unlock balance is too low. Top up for talent unlocks and sponsored roles to continue.");
        go("/employer/billing");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "We could not unlock this profile");
      // Searches started during the POST can return the pre-grant Locked row.
      // The completed grant wins over those in-flight snapshots, but never
      // re-inserts a row excluded by the current search.
      listGeneration.current += 1;
      setLoading(false);
      setError("");
      setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: true } : item));
      if (typeof payload.remaining === "number") setBalance(payload.remaining);
      toast(`${row.displayRef} unlocked. They decide whether to respond.`);
    } catch (unlockError) {
      restore();
      toast(unlockError instanceof Error ? unlockError.message : "We could not unlock this profile");
    } finally { unlockInFlight.current = null; setUnlockingId(null); }
  };

  const openProfile = async (row: TalentRow) => {
    const generation = listGeneration.current;
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}`, { credentials: "include" });
      const payload = await readApiJson<{ profile?: UnlockedProfile; error?: string }>(response, "We could not load this profile");
      if (response.status === 402) { toast("Unlock this profile first."); return; }
      if (!response.ok || !payload.profile) throw new Error(payload.error || "We could not load this profile");
      if (generation === listGeneration.current) setOpenedProfile({ displayRef: row.displayRef, profile: payload.profile });
    } catch (openError) { toast(openError instanceof Error ? openError.message : "We could not load this profile"); }
  };

  const sendIntroRequest = async (row: TalentRow) => {
    // The unlock already notified the seeker; this re-pings them with an
    // explicit intro request through the platform (never a direct email).
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}/intro`, { method: "POST", credentials: "include" });
      // 201 = a new intro, 200 = one already on record; 409 = the server
      // refused it (the unlock grant is no longer active), so nothing was sent.
      if (response.status === 200 || response.status === 201) { setIntroSentTo(row.displayRef); return; }
      const payload = await readApiJson<{ error?: string }>(response, "We could not send the intro request").catch(() => ({} as { error?: string }));
      // The 409 body says "Unlock this profile…", which reads wrong on a row
      // that shows Unlocked; the route returns it when the grant is inactive.
      toast(response.status === 409 ? "Intro not sent. This unlock may no longer be active." : (payload.error ? `Intro not sent. ${payload.error}.` : "Intro not sent. We could not send the intro request."));
    } catch { toast("Intro not sent. We could not send the intro request."); }
  };

  return (
    <EmployerGoalFrame screen="talent-discovery" page="employer-talent">
      <p className="text-g-meta text-g-ink-3">Employers</p>
      <h1 className="mt-1 text-g-heading text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 max-w-2xl text-g-meta text-g-ink-2">{SUBTITLE}</p>
      <div className="mt-6">
        <GoalNextStep reason="Search by skill, headline or place. You only ever see people who opted in.">
          <form onSubmit={event => { event.preventDefault(); void loadTalent(); }} className="mt-3 grid gap-2 gdesk:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <input aria-label="Search talent" value={query} onChange={event => setQuery(event.target.value)} placeholder="Skill, headline, or keyword" className={inputClass} />
            <input aria-label="Filter by location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" className={inputClass} />
            <GoalButton variant="primary" type="submit">Search</GoalButton>
          </form>
          <p className="mt-3 text-g-meta text-g-ink-2">
            Talent unlock balance: <GoalNum className="text-g-ink">{balance === null ? "—" : String(balance)}</GoalNum> · each unlock costs <GoalNum>{TALENT_UNLOCK_COST}</GoalNum> ·{" "}
            <a href="/employer/billing" className="text-g-ink underline underline-offset-4">Top up for talent unlocks</a>
          </p>
        </GoalNextStep>
      </div>

      <section aria-label="Opt-in talent" className="mt-6">
        {error ? (
          <GoalErrorState title={error} retry={{ label: "Try again", onClick: () => void loadTalent() }} className="border border-g-hairline bg-g-surface" />
        ) : loading ? (
          <div role="status" aria-label="Loading talent"><GoalSkeletonRows density="queue" count={3} className="py-3" /></div>
        ) : !talent.length ? (
          <GoalEmptyState title="No opt-in talent matches yet." body="Try a broader skill, or check back as more seekers opt in." className="border border-g-hairline bg-g-surface" />
        ) : (
          <ul className="grid gap-3 gdesk:grid-cols-2">
            {talent.map(row => {
              const opened = row.isUnlocked && openedProfile && openedProfile.displayRef === row.displayRef ? openedProfile.profile : null;
              const expertise = Array.isArray(opened?.expertise) ? opened.expertise.filter(Boolean) : [];
              // While the optimistic unlock is pending the server has not
              // granted anything yet, so no profile or intro action is offered.
              const pending = unlockingId === row.displayRef;
              return (
                <li key={row.displayRef} aria-label={row.displayRef} className="flex flex-col border border-g-hairline bg-g-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-all text-g-label text-g-ink">{row.displayRef}</h2>
                      <p className="mt-1 truncate text-g-meta text-g-ink-2">{row.headline || "skipwait.me member"}</p>
                    </div>
                    <GoalStatus className="shrink-0" status={row.isUnlocked && !pending ? "accepted" : "withdrawn"} label={row.isUnlocked && !pending ? "Unlocked" : "Locked"} />
                  </div>
                  {row.skills.length ? <ul aria-label="Skills" className="mt-3 flex flex-wrap gap-1.5">{row.skills.map(skill => <li key={skill} className="rounded-g-control border border-g-hairline px-2 py-0.5 text-g-meta text-g-ink">{skill}</li>)}</ul> : null}
                  {row.location ? <p className="mt-3 text-g-meta text-g-ink-2">{row.location}</p> : null}
                  {opened ? (
                    <div role="group" aria-label="Shared profile" className="mt-3 border-l-2 border-g-hairline pl-3 text-g-meta text-g-ink">
                      {opened.experience ? <p><span className="text-g-label">Experience:</span> {opened.experience}</p> : null}
                      {expertise.length ? <p className="mt-1"><span className="text-g-label">Expertise:</span> {expertise.join(", ")}</p> : null}
                      {!opened.experience && !expertise.length ? <p>No additional details shared yet.</p> : null}
                    </div>
                  ) : null}
                  <p className="mt-4 text-g-meta text-g-ink-3">{PRIVACY_LINE}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.isUnlocked && !pending ? (
                      <>
                        <GoalButton variant="outline" size="sm" onClick={() => void openProfile(row)}>View profile</GoalButton>
                        <GoalButton variant="outline" size="sm" leadingIcon={Send} disabledReason={introSentTo === row.displayRef ? "Intro already sent" : undefined} onClick={() => void sendIntroRequest(row)}>
                          {introSentTo === row.displayRef ? "Intro sent" : "Send intro request"}
                        </GoalButton>
                      </>
                    ) : (
                      <GoalButton variant="outline" size="sm" leadingIcon={Unlock} busy={pending} busyLabel="Unlocking…" disabledReason={unlockingId !== null && !pending ? "Another unlock is in progress" : undefined} onClick={() => void unlockTalent(row)}>
                        {`Unlock profile · costs ${TALENT_UNLOCK_COST}`}
                      </GoalButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </EmployerGoalFrame>
  );
}
