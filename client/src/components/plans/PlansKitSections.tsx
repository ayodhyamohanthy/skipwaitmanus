// GO-LIVE-1 /plans purchase slice: the coverage block, the credit packs and
// the 30/90-day passes + Keep warm, all rendered from the live catalog and
// buying through the kit checkout endpoints. Prices and availability come from
// GET /api/plans/catalog; the server charges catalog amounts and refuses
// before any provider call when an item price is not on sale.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Check, Clock3, Crown, LoaderCircle, Pause } from "lucide-react";
import { z } from "zod";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import type { CatalogCurrency } from "@shared/planCatalog";
import { CREDIT_RULE_SHORT } from "@shared/moneyCopy";
import { Button } from "@/components/kit/button";
import { fetchCompanyDirectory } from "@/lib/companyDirectory";
import { useAuth } from "@/_core/auth";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { plansCatalogKeys } from "./plansCatalogApi";
import { catalogPackCards, catalogPassCards, type PackCardCopy, type PassCardCopy, type PassTerm } from "./planCatalog";
import type { PaidCatalogPlan } from "@shared/planCatalog";

export type Role = "job_seeker" | "referrer";

export type KitCheckout = {
  buying: string | null;
  failure: { key: string; message: string } | null;
  unavailable: ReadonlySet<string>;
  buyPack: (pack: PackCardCopy) => Promise<void>;
  buyPass: (card: PassCardCopy) => Promise<void>;
};

const PENDING_CHECKOUT_KEY = "skipwait.pending-chargebee-checkout";

export type PendingCheckout = { hostedPageId: string; role: Role; kind: "pack" | "plan" };

/** The checkout the pending-return screen reconciles if the webhook is late. */
export function readPendingCheckout(): PendingCheckout | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PENDING_CHECKOUT_KEY) ?? "null");
    if (typeof saved?.hostedPageId !== "string" || saved.hostedPageId.length === 0) return null;
    if (saved.role !== "job_seeker" && saved.role !== "referrer") return null;
    return { hostedPageId: saved.hostedPageId, role: saved.role, kind: saved.kind === "plan" ? "plan" : "pack" };
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try { window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch { /* storage optional */ }
}

/** Buy flow for one pack or pass: sign-in first, then the server decides before any provider call. */
export function useKitCheckout(input: { role: Role; currency: CatalogCurrency; isSignedIn: boolean; getToken: () => Promise<string | null>; openSignIn: () => void }): KitCheckout {
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());

  const billingCountry = input.currency === "INR" ? "IN" : "INTL";

  const start = async (key: string, url: string, body: Record<string, unknown>, kind: "pack" | "plan"): Promise<void> => {
    if (!input.isSignedIn) { input.openSignIn(); return; }
    setBuying(key);
    setFailure(null);
    try {
      const token = await input.getToken();
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; checkoutUrl?: string; hostedPageId?: string };
      if (response.ok && typeof payload.checkoutUrl === "string") {
        // The pending-return screen reconciles this checkout if the webhook is late.
        try { window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ hostedPageId: payload.hostedPageId ?? "", role: input.role, kind })); } catch { /* storage optional */ }
        openChargebeeCheckout(payload.checkoutUrl);
        return;
      }
      if (response.status === 409) {
        // Not on sale any more: disable the button and refresh the live catalog.
        setUnavailable(current => new Set(current).add(key));
        void queryClient.invalidateQueries({ queryKey: plansCatalogKeys.catalog });
        setFailure({ key, message: payload.error ?? "That is not on sale yet. Nothing has been charged." });
        return;
      }
      if (response.status === 503) {
        setFailure({ key, message: "Billing is temporarily offline. Nothing is charged. Try again in a moment." });
        return;
      }
      setFailure({ key, message: payload.error ?? "We could not start checkout. Nothing has been charged." });
    } catch {
      setFailure({ key, message: "We could not start checkout. Check your connection and try again. Nothing has been charged." });
    } finally {
      setBuying(null);
    }
  };

  return {
    buying,
    failure,
    unavailable,
    buyPack: pack => start(`pack:${pack.id}`, "/api/chargebee/checkout", { packId: pack.id, billingCountry, role: input.role }, "pack"),
    buyPass: card => start(`plan:${card.id}:${card.interval}`, "/api/chargebee/subscription-checkout", { planId: card.id, interval: card.interval, currency: input.currency, billingCountry, role: input.role }, "plan"),
  };
}

/** Credit packs for the catalog's currency; prices and availability are the server's answers. */
export function PacksSection({ catalog, checkout }: { catalog: PlanCatalogResponse; checkout: KitCheckout }) {
  const packs = catalogPackCards(catalog);
  if (packs.length === 0) return null;
  return <section className="plans-section" id="packs" aria-label="Credit packs">
    <span className="eyebrow">CREDIT PACKS</span>
    <h2>Add credits that never expire<span className="brand-dot">.</span></h2>
    <p className="plan-grid-note">Pay once per pack. Each ask a verified employee can see uses 1 credit; {CREDIT_RULE_SHORT}.</p>
    <div className="plan-grid">
      {packs.map(pack => {
        const key = `pack:${pack.id}`;
        return <article key={pack.id} className={`plan-card ${pack.recommended ? "featured" : ""}`}>
          {pack.recommended ? <span className="plan-flag"><Crown />Best value</span> : null}
          <h3>{pack.credits} credits</h3>
          <div className="plan-price"><strong>{pack.price}</strong><span>one time</span></div>
          <ul><li><Check />{pack.credits} private asks a verified employee can see</li><li><Check />Credits never expire</li></ul>
          <PackBuy pack={pack} itemKey={key} checkout={checkout} />
        </article>;
      })}
    </div>
  </section>;
}

function PackBuy({ pack, itemKey, checkout }: { pack: PackCardCopy; itemKey: string; checkout: KitCheckout }) {
  const unavailable = checkout.unavailable.has(itemKey);
  return <div className="grid gap-2">
    <Button className="brand-button w-full" disabled={!pack.available || unavailable || checkout.buying !== null} onClick={() => void checkout.buyPack(pack)}>
      {checkout.buying === itemKey ? <LoaderCircle className="animate-spin" /> : null}
      {unavailable || !pack.available ? "Not on sale yet" : checkout.buying === itemKey ? "Opening secure checkout…" : pack.firstPack ? "Start with this pack" : "Buy pack"}
    </Button>
    {checkout.failure?.key === itemKey ? <p role="alert" className="text-xs leading-5 text-destructive">{checkout.failure.message}</p> : null}
  </div>;
}

/** The 30/90-day passes plus Keep warm by the year; Concierge stays by application. */
export function PassesSection({ catalog, activePlan, checkout }: { catalog: PlanCatalogResponse; activePlan: PaidCatalogPlan | null; checkout: KitCheckout }) {
  const [term, setTerm] = useState<PassTerm>("30d");
  const cards = catalogPassCards(catalog, term, activePlan);
  if (cards.length === 0 || !cards.some(card => card.available)) return null;
  return <section className="plans-section" aria-label="Passes and yearly plans">
    <span className="eyebrow">PASSES &amp; YEARLY</span>
    <div className="page-heading"><div>
      <h2>More help, for exactly as long as you need<span className="brand-dot">.</span></h2>
      <p>Every pass is paid once and never renews by itself. You can switch or level up anytime; a pass simply ends when its days are over.</p>
    </div>
    <div role="group" aria-label="Pass length" className="heading-aside">
      <Button variant={term === "30d" ? "default" : "outline"} size="sm" aria-pressed={term === "30d"} onClick={() => setTerm("30d")}>30 days</Button>
      <Button variant={term === "90d" ? "default" : "outline"} size="sm" aria-pressed={term === "90d"} onClick={() => setTerm("90d")}>90 days</Button>
    </div></div>
    <div className="plan-grid">
      {cards.map(card => {
        const key = `plan:${card.id}:${card.interval}`;
        const isActive = activePlan !== null && card.id === activePlan.id;
        return <article key={`${card.id}-${card.interval}`} className={`plan-card ${isActive || card.recommended ? "featured" : ""}`}>
          {isActive ? <span className="plan-flag"><Crown />Your plan</span> : card.recommended ? <span className="plan-flag">Popular</span> : null}
          <h3>{card.displayName}</h3>
          <p className="plan-tag">{card.tagline}</p>
          <div className="plan-price"><strong>{card.price}</strong><span>{card.per}</span></div>
          <ul>{card.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
          {card.byApplication
            ? <Button asChild variant="outline" className="brand-button w-full"><Link href="/support">Request application<ArrowRight /></Link></Button>
            : isActive
              ? <p role="status" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[18px] border-2 border-foreground px-5 text-sm font-semibold"><Check className="size-4 text-primary" />Your current plan</p>
              : !card.buyable
                ? <p role="status" className="plan-grid-note">Included in your current plan.</p>
                : <PassBuy card={card} itemKey={key} checkout={checkout} />}
        </article>;
      })}
    </div>
  </section>;
}

function PassBuy({ card, itemKey, checkout }: { card: PassCardCopy; itemKey: string; checkout: KitCheckout }) {
  const unavailable = checkout.unavailable.has(itemKey);
  return <div className="grid gap-2">
    <Button className="brand-button w-full" disabled={!card.available || unavailable || checkout.buying !== null} onClick={() => void checkout.buyPass(card)}>
      {checkout.buying === itemKey ? <LoaderCircle className="animate-spin" /> : null}
      {unavailable || !card.available ? "Not on sale yet" : checkout.buying === itemKey ? "Opening secure checkout…" : `Get ${card.displayName}`}
    </Button>
    {checkout.failure?.key === itemKey ? <p role="alert" className="text-xs leading-5 text-destructive">{checkout.failure.message}</p> : null}
  </div>;
}

// --- Coverage block -----------------------------------------------------------

const mineAskSchema = z.object({
  requests: z.array(z.looseObject({
    id: z.number(),
    companyDomain: z.string().optional(),
    companyName: z.string().nullish(),
    status: z.string().optional(),
    waitingForCoverage: z.boolean().nullish(),
    queueStatus: z.enum(["available_for_review", "waiting_for_coverage", "held_for_credit"]).nullish(),
  })),
});

type CoverageRow = { key: string; name: string; mark: string; state: "visible" | "waiting" | "held" };

const COVERAGE_COPY: Record<CoverageRow["state"], string> = {
  visible: "A verified employee can see this ask.",
  waiting: "Waits at no cost until a verified employee is available.",
  held: "On hold until you add a credit.",
};

const rowIcon = (state: CoverageRow["state"]) => state === "visible" ? <Check /> : state === "held" ? <Pause /> : <Clock3 />;

/**
 * Where the seeker's asks stand: live companies are covered, uncovered asks
 * wait at no cost, held asks need one credit. Shown on /plans so buying a pack
 * or pass is never a guess about whether it will be used.
 */
export function CoverageBlock({ isSignedIn, getToken }: { isSignedIn: boolean; getToken: () => Promise<string | null> }) {
  const mine = useQuery({
    queryKey: ["plans-coverage", "mine"],
    enabled: isSignedIn,
    staleTime: 30_000,
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/company-referrals/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("mine");
      return mineAskSchema.parse(await response.json());
    },
  });
  const directory = useQuery({ queryKey: ["plans-coverage", "directory"], queryFn: fetchCompanyDirectory, staleTime: 5 * 60_000 });

  if (!isSignedIn || !mine.data) return null;
  const openByDomain = new Map((directory.data?.companies ?? []).flatMap(company => company.domains.map(domain => [domain.toLowerCase(), company.openToReferrals] as const)));

  const rows: CoverageRow[] = [];
  for (const ask of mine.data.requests) {
    if (rows.length >= 5) break;
    if (ask.status && ask.status !== "pending") continue;
    const domain = (ask.companyDomain ?? "").toLowerCase();
    const open = openByDomain.get(domain) === true;
    const state: CoverageRow["state"] = ask.queueStatus === "held_for_credit" ? "held"
      : ask.queueStatus === "available_for_review" ? "visible"
      : ask.queueStatus === "waiting_for_coverage" || ask.waitingForCoverage === true || !open ? "waiting"
      : "visible";
    const name = ask.companyName?.trim() || domain;
    rows.push({ key: `ask-${ask.id}`, name, mark: (name.charAt(0) || "?").toUpperCase(), state });
  }
  // Fill the block with waitlisted companies so the no-cost wait is visible before an ask exists.
  for (const company of directory.data?.companies ?? []) {
    if (rows.length >= 5) break;
    if (company.openToReferrals || rows.some(row => row.name === company.name)) continue;
    rows.push({ key: `co-${company.slug}`, name: company.name, mark: company.initials, state: "waiting" });
  }
  if (rows.length === 0) return null;

  return <section className="plans-section" aria-label="Where your asks stand">
    <span className="eyebrow">COVERAGE</span>
    <h2>Where your asks stand<span className="brand-dot">.</span></h2>
    <ul className="grid gap-2">
      {rows.map(row => <li key={row.key} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">{row.mark}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{rowIcon(row.state)}{COVERAGE_COPY[row.state]}</span>
      </li>)}
    </ul>
  </section>;
}
