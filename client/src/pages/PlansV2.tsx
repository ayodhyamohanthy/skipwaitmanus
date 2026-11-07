// Plans v2 ("Choose your reach.") - D-132 frozen bundled model. Behind
// VITE_PLAN_FAMILY_V2 (OFF everywhere): NOT live until QA's payment-path
// check passes and the owner's enable word is relayed (D-132 enable bar).
// Design follows the owner's screenshot (Oct 21 18:24) in the goal-ui token
// language: ink on white, mono labels, one black commit (Fast Track).
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  OPEN_DOOR_FREE_CREDITS_PER_MONTH,
  PLAN_BENEFIT_CAPS,
  PLAN_CREDIT_LADDER,
  PLAN_CREDIT_RUNGS,
  PLAN_FAMILY,
  perCreditMinor,
  PLAN_DISPLAY_NAME,
  REACH_LEVEL_NAMES,
  planReachFor,
  planFeeMinor,
  rungSavingsMinor,
  thisMonthMinor,
  type PlanCreditRung,
  type PlanFamilyId,
  type PlanPriceBook,
} from "@shared/planFamily";
import { money } from "@/components/plans/format";

type Pick = PlanCreditRung | null; // null = the free pick (Open Door default)

const CARD_COPY: Record<PlanFamilyId, { name: string; feeNote: string; bullets: string[]; cta: string; primary: boolean }> = {
  open_door: {
    name: "Free to join. Start with no card.",
    feeNote: "no commitment",
    bullets: ["3 free referrals every month", "Referrers matched at your own level", "Cost shown before every ask"],
    cta: "Start free",
    primary: false,
  },
  fast_track: {
    name: "Move faster, reach higher.",
    feeNote: "/ month",
    bullets: [
      "4 open asks at once",
      "Ask coach 10/mo - profile check 2/mo - tailoring 3/mo",
      "Follow-up drafts 6/mo",
      "Reach up to 2 levels above your own",
      "Credits never expire, top up any time",
    ],
    cta: "Start Mid level Referrers",
    primary: true,
  },
  insider: {
    name: "Your whole search, automated. By application.",
    feeNote: "/ month - by application",
    bullets: [
      "Everything in Mid level Referrers",
      "Reach up to 4 levels above your own",
      "6 open asks at once",
      "Research briefs 10/mo - dossiers + mock interviews 4/mo each",
      "Offer + salary coach 2/mo each - smart timing",
      "Stealth included - your employer never sees you",
    ],
    cta: "Apply for Senior level Referrers",
    primary: false,
  },
};

const DEFAULT_PICK: Record<PlanFamilyId, Pick> = { open_door: null, fast_track: 25, insider: 50 };

function RungList({ planId, book, value, onPick }: { planId: PlanFamilyId; book: PlanPriceBook; value: Pick; onPick: (pick: Pick) => void }) {
  const [open, setOpen] = useState(false);
  const currentLabel = value === null ? `${OPEN_DOOR_FREE_CREDITS_PER_MONTH} free credits` : `${value} credits`;
  const currentPrice = value === null ? money(0, book) : money(thisMonthMinor(planId, value, book) - planFeeMinor(planId, book), book);
  return (
    <div className="relative">
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Credits per month</p>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Credits per month for ${planId}`}
        onClick={() => setOpen(v => !v)}
        className="mt-2 flex w-full items-center justify-between rounded-g-tile border border-g-hairline bg-g-surface px-3 py-2.5 text-g-small"
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold">{currentLabel}</span>
          {value !== null ? <span className="font-g-mono text-[11px] uppercase tracking-[0.1em] text-g-ink-3">Save {PLAN_CREDIT_LADDER.find(r => r.credits === value)!.savePct}%</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-g-mono text-[13px]">{currentPrice}</span>
          <ChevronDown aria-hidden="true" className="size-4 text-g-ink-3" />
        </span>
      </button>
      {open ? (
        <ul role="listbox" aria-label="Credit amounts" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-g-tile border border-g-hairline bg-g-surface shadow-lg">
          {planId === "open_door" ? (
            <li key="free">
              <button type="button" role="option" aria-selected={value === null} onClick={() => { onPick(null); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-g-small hover:bg-g-surface-sunken">
                <span className="flex items-center gap-2 whitespace-nowrap font-semibold">{OPEN_DOOR_FREE_CREDITS_PER_MONTH} free credits {value === null ? <Check aria-hidden="true" className="size-4" /> : null}</span>
                <span className="font-g-mono text-[13px]">{money(0, book)}</span>
              </button>
            </li>
          ) : null}
          {PLAN_CREDIT_RUNGS.map(credits => {
            const rung = PLAN_CREDIT_LADDER.find(r => r.credits === credits)!;
            const selected = value === credits;
            return (
              <li key={credits}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onPick(credits); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-g-small hover:bg-g-surface-sunken ${selected ? "bg-g-surface-selected" : ""}`}
                >
                  <span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-semibold">{credits} credits</span>
                      <span className="font-g-mono text-[11px] uppercase tracking-[0.1em] text-g-ink-3">Save {rung.savePct}%</span>
                      {selected ? <Check aria-hidden="true" className="size-4" /> : null}
                    </span>
                    <span className="mt-0.5 block font-g-mono text-[11px] text-g-ink-3">{money(perCreditMinor(credits, book), book)} per credit</span>
                  </span>
                  <span className="font-g-mono text-[13px]">{money(book === "INR" ? rung.inrPaise : rung.usdCents, book)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const REACH_SUB: Record<PlanFamilyId, string> = { open_door: "Your own level", fast_track: "Up to 2 levels above yours", insider: "Up to 4 levels above yours" };

function ReachRow({ planId, seekerLevel }: { planId: PlanFamilyId; seekerLevel: number | null }) {
  const r = seekerLevel !== null && Number.isFinite(seekerLevel) ? planReachFor(planId, seekerLevel) : null;
  return (
    <div className="mt-4 border-t border-g-hairline pt-4" data-testid={`reach-${planId}`}>
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Who you can ask</p>
      {r ? (
        <p className="mt-1 text-g-small">
          {planId === "open_door" ? `Your own level: ${r.levelNames}` : r.levelNames} <span aria-hidden="true">·</span> <span className="font-g-mono text-[13px]">{r.levelText}</span>
        </p>
      ) : (
        <p className="mt-1 text-g-small">{REACH_SUB[planId]}</p>
      )}
      {r && planId !== "open_door" ? <p className="mt-0.5 text-g-badge text-g-ink-3">{REACH_SUB[planId]}</p> : null}
    </div>
  );
}

function PlanCard({ planId, book, seekerLevel }: { planId: PlanFamilyId; book: PlanPriceBook; seekerLevel: number | null }) {
  const entry = PLAN_FAMILY.find(p => p.id === planId)!;
  const copy = CARD_COPY[planId];
  const [pick, setPick] = useState<Pick>(DEFAULT_PICK[planId]);
  const [note, setNote] = useState("");
  const fee = planFeeMinor(planId, book);
  const total = thisMonthMinor(planId, pick, book);
  return (
    <section aria-label={PLAN_DISPLAY_NAME[planId]} className="flex flex-col rounded-2xl border border-g-hairline bg-g-surface p-5 gdesk:p-6">
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{PLAN_DISPLAY_NAME[planId]}</p>
      <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.01em]">{copy.name}</h2>
      <p className="mt-1 text-g-small text-g-ink-2">Plan fee {money(fee, book)} {copy.feeNote}</p>
      <div className="mt-4">
        <RungList planId={planId} book={book} value={pick} onPick={setPick} />
      </div>
      <dl className="mt-4 space-y-1.5 border-t border-g-hairline pt-4 text-g-small">
        <div className="flex justify-between"><dt className="text-g-ink-2">Plan fee</dt><dd className="font-g-mono text-[13px]">{money(fee, book)}</dd></div>
        {pick !== null ? (
          <div className="flex justify-between">
            <dt className="text-g-ink-2">{pick} credits - save {money(rungSavingsMinor(pick, book), book)} ({PLAN_CREDIT_LADDER.find(r => r.credits === pick)!.savePct}%)</dt>
            <dd className="font-g-mono text-[13px]">{money(thisMonthMinor(planId, pick, book) - fee, book)}</dd>
          </div>
        ) : (
          <div className="flex justify-between"><dt className="text-g-ink-2">{OPEN_DOOR_FREE_CREDITS_PER_MONTH} free credits</dt><dd className="font-g-mono text-[13px]">{money(0, book)}</dd></div>
        )}
        <div className="flex justify-between pt-1 text-[15px] font-semibold"><dt>This month</dt><dd className="font-g-mono" data-testid={`this-month-${planId}`}>{money(total, book)}</dd></div>
      </dl>
      <ReachRow planId={planId} seekerLevel={seekerLevel} />
      <ul className="mt-4 space-y-1.5 border-t border-g-hairline pt-4">
        {copy.bullets.map(line => (
          <li key={line} className="flex items-start gap-2 text-g-small text-g-ink-2"><span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-g-ink" />{line}</li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <button
          type="button"
          data-g-primary={copy.primary || undefined}
          onClick={() => {
            if (planId === "open_door") { window.location.href = "/sign-in"; return; }
            setNote("Checkout and the application flow arrive with the payment switch-on (flag OFF - D-132).");
          }}
          className={copy.primary
            ? "g-hit w-full rounded-[10px] bg-g-ink px-5 text-g-small font-semibold text-g-ink-inverse hover:bg-g-primary-hover"
            : "g-hit w-full rounded-[10px] border border-g-hairline bg-g-surface px-5 text-g-small font-semibold"}
        >
          {copy.cta}
        </button>
        {note ? <p role="status" className="mt-2 text-g-badge text-g-ink-3">{note}</p> : null}
      </div>
    </section>
  );
}

const COMPARE_ROWS: { label: string; cell: (id: PlanFamilyId) => string }[] = [
  { label: "Free credits monthly", cell: () => String(OPEN_DOOR_FREE_CREDITS_PER_MONTH) },
  { label: "Open asks at once", cell: id => String(PLAN_BENEFIT_CAPS[id].openAsks) },
  { label: "Ask coach + rewrite", cell: id => PLAN_BENEFIT_CAPS[id].tools.ask_coach === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.ask_coach) },
  { label: "Profile check", cell: id => PLAN_BENEFIT_CAPS[id].tools.profile_check === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.profile_check) },
  { label: "Resume-to-job tailoring", cell: id => PLAN_BENEFIT_CAPS[id].tools.resume_tailoring === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.resume_tailoring) },
  { label: "Follow-up + thank-you drafts", cell: id => PLAN_BENEFIT_CAPS[id].tools.follow_up_drafts === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.follow_up_drafts) },
  { label: "Company research brief", cell: id => PLAN_BENEFIT_CAPS[id].tools.company_brief === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.company_brief) },
  { label: "Interview dossier", cell: id => PLAN_BENEFIT_CAPS[id].tools.interview_dossier === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.interview_dossier) },
  { label: "AI mock interview", cell: id => PLAN_BENEFIT_CAPS[id].tools.mock_interview === 0 ? "Per use" : String(PLAN_BENEFIT_CAPS[id].tools.mock_interview) },
  { label: "Offer + salary coach", cell: id => PLAN_BENEFIT_CAPS[id].tools.offer_comparison === 0 ? "Per use" : `${PLAN_BENEFIT_CAPS[id].tools.offer_comparison} each` },
  { label: "Level-fit insight", cell: id => (id === "open_door" ? "Basic" : id === "fast_track" ? "Yes" : "Yes, with detail") },
  { label: "Smart timing", cell: id => (id === "insider" ? "Yes" : "-") },
];

export default function PlansV2({ book = "INR", seekerLevel = null, onPickLevel }: { book?: PlanPriceBook; seekerLevel?: number | null; onPickLevel?: (level: number | null) => void }) {
  const cmpRef = useRef<HTMLDivElement>(null);
  const [cmpCanScrollRight, setCmpCanScrollRight] = useState(false);
  useEffect(() => {
    const el = cmpRef.current;
    if (!el) return;
    const update = () => setCmpCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
    }
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-8 gdesk:px-8 gdesk:py-12">
      <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Choose your reach.</h1>
      <p className="mt-3 max-w-[640px] text-g-body text-g-ink-2">Credits pay for asks - the plan unlocks reach and extras. Pick a plan below, change or cancel any time. Draft prices - current best, changeable.</p>
      <p className="mt-2 text-g-small text-g-ink-3">
        {book === "INR"
          ? "Prices for India - set by your profile location, confirmed against your card's billing country at checkout."
          : "Global prices - set by your profile location, confirmed against your card's billing country at checkout."}
      </p>
      <p className="mt-2 max-w-[640px] text-g-small text-g-ink-3">Plan names say how far you can reach, not how senior you are.</p>
      <p className="mt-1 max-w-[640px] text-g-small text-g-ink-3">Reach sets who you can ask. It never changes your place in a queue.</p>
      {onPickLevel ? (
        <label className="mt-3 flex max-w-[360px] flex-col gap-1 text-g-small">
          <span className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Your level</span>
          <select aria-label="Your level" aria-describedby={seekerLevel === null ? "level-hint" : undefined} value={seekerLevel ?? ""} onChange={e => onPickLevel(e.target.value === "" ? null : Number(e.target.value))} className="rounded-g-tile border border-g-hairline bg-g-surface px-3 py-2.5">
            <option value="">Not set</option>
            {Object.entries(REACH_LEVEL_NAMES).map(([n, label]) => <option key={n} value={n}>{`L${n} - ${label}`}</option>)}
          </select>
        </label>
      ) : null}
      {seekerLevel === null && onPickLevel ? <p id="level-hint" className="mt-1 text-g-small text-g-ink-3">Set your level here to see exactly who each plan reaches.</p> : null}
      {seekerLevel === null && !onPickLevel ? <p className="mt-1 text-g-small text-g-ink-3">Sign in and set your level to see exactly who each plan reaches.</p> : null}
      <div className="mt-8 grid gap-4 gdesk:grid-cols-3">
        <PlanCard planId="open_door" book={book} seekerLevel={seekerLevel} />
        <PlanCard planId="fast_track" book={book} seekerLevel={seekerLevel} />
        <PlanCard planId="insider" book={book} seekerLevel={seekerLevel} />
      </div>
      <section aria-label="Compare plans" className="mt-12">
        <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Compare plans</p>
        <p className="mt-2 text-g-small text-g-ink-3">Caps are monthly and config-driven - current best, changeable. Past a cap, tools use normal credits.</p>
        <div className="relative mt-4">
        <div
          ref={cmpRef}
          role="region"
          aria-label="Plan comparison table, scroll horizontally to see all plans"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[520px] border-collapse text-g-small">
            <thead>
              <tr className="border-b border-g-hairline">
                <th className="sticky left-0 z-[1] border-r border-g-hairline bg-g-surface py-2 pr-4 text-left font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="sr-only">Feature</span></th>
                {PLAN_FAMILY.map(p => <th key={p.id} className="py-2 pr-4 text-right font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{PLAN_DISPLAY_NAME[p.id]}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(row => (
                <tr key={row.label} className="border-b border-g-hairline">
                  <th scope="row" className="sticky left-0 z-[1] border-r border-g-hairline bg-g-surface py-2.5 pr-4 text-left font-normal text-g-ink-2">{row.label}</th>
                  {PLAN_FAMILY.map(p => <td key={p.id} className="py-2.5 pr-4 text-right font-g-mono text-[13px]">{row.cell(p.id)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cmpCanScrollRight ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-[linear-gradient(to_right,transparent,var(--g-surface)_75%)] pr-1 text-g-ink-3">
            <ChevronDown className="-rotate-90" size={16} />
          </div>
        ) : null}
        </div>
      </section>
    </div>
  );
}
