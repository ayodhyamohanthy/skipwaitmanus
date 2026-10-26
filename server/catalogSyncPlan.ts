// Classifies one Chargebee site against the sold catalog. Pure: no network, no
// writes. The dry run it returns is what the admin page shows, and its planHash
// pins exactly what an apply would create (D-069).
import { createHash } from "node:crypto";
import type { CatalogPrice } from "../shared/billingCatalog";
import type { CatalogSyncAction, CatalogSyncDiff, CatalogSyncDryRun, ItemPriceSpec } from "../shared/catalogSync";
import { itemPriceMatches } from "./billingAvailability";
import type { DesiredCatalogEntry } from "./catalogSyncDesired";

export type ProviderFamily = { id: string; name?: string; status?: string };
export type ProviderItem = {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  item_family_id?: string;
  enabled_for_checkout?: boolean;
  [field: string]: unknown;
};
export type ProviderItemPrice = {
  id: string;
  name?: string;
  item_id?: string;
  item_family_id?: string;
  item_type?: string;
  status?: string;
  currency_code?: string;
  price?: number;
  pricing_model?: string;
  period?: number;
  period_unit?: string;
  billing_cycles?: number;
  [field: string]: unknown;
};

/** The provider state the planner classifies. */
export type CatalogSiteState = { families: ProviderFamily[]; items: ProviderItem[]; itemPrices: ProviderItemPrice[] };

export type CatalogFamilyPlan = CatalogSyncDryRun["family"];

const NAMESPACE = "skipwait_";

function isNamespaceId(id: string): boolean {
  return id.startsWith(NAMESPACE);
}

function periodsInMonths(period: number | null, unit: string | null): number | null {
  if (period === null || unit === null) return null;
  if (unit === "year") return period * 12;
  if (unit === "month") return period;
  return null;
}

function periodLabel(period: number | null, unit: string | null): string | null {
  if (period === null || unit === null) return null;
  return `${period} ${unit}${period === 1 ? "" : "s"}`;
}

function samePeriod(price: ProviderItemPrice, spec: ItemPriceSpec): boolean {
  return periodsInMonths(price.period ?? null, price.period_unit ?? null) === periodsInMonths(spec.period, spec.periodUnit);
}

function sameBillingFrequency(price: ProviderItemPrice, spec: ItemPriceSpec): boolean {
  return periodsInMonths(price.period ?? null, price.period_unit ?? null) === periodsInMonths(spec.period, spec.periodUnit);
}

/** Everything about an existing price that differs from the spec; an empty array means it is correct. */
export function priceDiffs(price: ProviderItemPrice, spec: ItemPriceSpec): CatalogSyncDiff[] {
  const diffs: CatalogSyncDiff[] = [];
  if (price.price !== spec.price) diffs.push({ field: "price", expected: spec.price, actual: price.price ?? null });
  if ((price.currency_code ?? null) !== spec.currencyCode) diffs.push({ field: "currency_code", expected: spec.currencyCode, actual: price.currency_code ?? null });
  if (!samePeriod(price, spec)) {
    diffs.push({ field: "period", expected: periodLabel(spec.period, spec.periodUnit), actual: periodLabel(price.period ?? null, price.period_unit ?? null) });
  }
  if ((price.status ?? null) !== "active") diffs.push({ field: "status", expected: "active", actual: price.status ?? null });
  if ((price.pricing_model ?? null) !== spec.pricingModel) diffs.push({ field: "pricing_model", expected: spec.pricingModel, actual: price.pricing_model ?? null });
  if ((price.billing_cycles ?? null) !== spec.billingCycles) {
    diffs.push({ field: "billing_cycles", expected: spec.billingCycles, actual: price.billing_cycles ?? null });
  }
  return diffs;
}

function termOf(price: CatalogPrice): CatalogSyncDryRun["correct"][number]["term"] {
  if (price.kind === "v2plan" || price.kind === "v2credits") return "monthly";
  if (price.kind !== "plan") return "one_time";
  if (price.interval === "yearly") return "yearly";
  if (price.interval === "90d") return "90d";
  return "30d";
}

type FamilyChoice = { plan: CatalogFamilyPlan; familyId: string | null };

function chooseFamily(state: CatalogSiteState): FamilyChoice {
  const used = new Set<string>();
  for (const item of state.items) {
    if (isNamespaceId(item.id) && item.item_family_id) used.add(item.item_family_id);
  }
  for (const price of state.itemPrices) {
    if (isNamespaceId(price.id) && price.item_family_id) used.add(price.item_family_id);
  }
  const usedIds = Array.from(used).sort();
  if (usedIds.length > 1) {
    return {
      familyId: null,
      plan: {
        id: null,
        action: "blocked",
        reason: `SkipWait objects belong to more than one product family (${usedIds.join(", ")}); resolve this in Chargebee before syncing.`,
      },
    };
  }
  if (usedIds.length === 1) {
    return { familyId: usedIds[0] ?? null, plan: { id: usedIds[0] ?? null, action: "reuse", reason: "Existing SkipWait prices use this product family." } };
  }
  const existing = state.families.find(family => family.id === "skipwait");
  if (existing) return { familyId: existing.id, plan: { id: existing.id, action: "reuse", reason: "The SkipWait product family already exists." } };
  const hasSkipwaitObjects = state.items.some(item => isNamespaceId(item.id)) || state.itemPrices.some(price => isNamespaceId(price.id));
  if (hasSkipwaitObjects) {
    return { familyId: null, plan: { id: null, action: "none", reason: "SkipWait objects exist but none belongs to a product family; new items are created without one." } };
  }
  return { familyId: "skipwait", plan: { id: "skipwait", action: "create", reason: "No SkipWait product family exists yet, so one is created." } };
}

function itemBlockReason(entry: DesiredCatalogEntry, state: CatalogSiteState): string | null {
  const item = state.items.find(candidate => candidate.id === entry.item.id);
  if (!item) return null;
  if (item.type && item.type !== entry.item.type) {
    return `SkipWait item ${entry.item.id} already exists as a ${item.type}, not a ${entry.item.type}.`;
  }
  if (item.status === "archived") return `SkipWait item ${entry.item.id} is archived in Chargebee; restore it before syncing.`;
  if (item.enabled_for_checkout === false) return `Checkout is switched off for ${entry.item.id} in Chargebee; switch it on before syncing.`;
  return null;
}

function frequencyBlockReason(entry: DesiredCatalogEntry, state: CatalogSiteState): string | null {
  const holder = state.itemPrices.find(price => (
    price.id !== entry.spec.id
    && price.item_id === entry.spec.itemId
    && price.status === "active"
    && price.currency_code === entry.spec.currencyCode
    && sameBillingFrequency(price, entry.spec)
  ));
  if (!holder) return null;
  const frequency = periodLabel(holder.period ?? null, holder.period_unit ?? null) ?? "one time";
  return `Another active price on ${entry.spec.itemId} already sells ${entry.spec.currencyCode} every ${frequency}: ${holder.id}.`;
}

function extraNote(kind: "item" | "item_price", id: string): string {
  if (/^skipwait_(pro|max)/.test(id) || id.startsWith("skipwait_token_")) {
    return `Legacy SkipWait ${kind === "item" ? "item" : "item price"} (D-036/D-067); left alone.`;
  }
  if (id.includes("land_concierge")) return "Land Concierge is sold by application; left alone.";
  if (id.includes("written_review") || id.includes("live_session")) return "A human session is sold only once reviewers are staffed; left alone.";
  return "Outside the sold catalog; left alone.";
}

function extrasOf(desired: readonly DesiredCatalogEntry[], state: CatalogSiteState) {
  const desiredItems = new Set(desired.map(entry => entry.item.id));
  const desiredPrices = new Set(desired.map(entry => entry.spec.id));
  const items = state.items
    .filter(item => isNamespaceId(item.id) && !desiredItems.has(item.id))
    .map(item => ({ kind: "item" as const, id: item.id, status: item.status ?? "unknown", note: extraNote("item", item.id) }));
  const prices = state.itemPrices
    .filter(price => isNamespaceId(price.id) && !desiredPrices.has(price.id))
    .map(price => ({ kind: "item_price" as const, id: price.id, status: price.status ?? "unknown", note: extraNote("item_price", price.id) }));
  return [...items, ...prices].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

export function planCatalogSync(input: {
  desired: readonly DesiredCatalogEntry[];
  excluded: readonly { itemPriceId: string; reason: string }[];
  state: CatalogSiteState;
  site: string;
  environment: "test" | "live";
  checkedAt: Date;
}): CatalogSyncDryRun {
  const { desired, excluded, state, site, environment, checkedAt } = input;
  const family = chooseFamily(state);

  const planned: DesiredCatalogEntry[] = [];
  const correct: CatalogSyncDryRun["correct"] = [];
  const mismatched: CatalogSyncDryRun["mismatched"] = [];
  const blocked: CatalogSyncDryRun["blocked"] = [];

  for (const entry of desired) {
    const existing = state.itemPrices.find(price => price.id === entry.spec.id);
    if (family.plan.action === "blocked") {
      blocked.push({ itemPriceId: entry.spec.id, currencyCode: entry.spec.currencyCode, price: entry.spec.price, term: termOf(entry.price), reason: family.plan.reason });
      continue;
    }
    if (!existing || existing.status === "deleted") {
      const reason = itemBlockReason(entry, state) ?? frequencyBlockReason(entry, state);
      if (reason) {
        blocked.push({ itemPriceId: entry.spec.id, currencyCode: entry.spec.currencyCode, price: entry.spec.price, term: termOf(entry.price), reason });
      } else {
        planned.push(entry);
      }
      continue;
    }
    const diffs = priceDiffs(existing, entry.spec);
    if (diffs.length === 0) {
      correct.push({ itemPriceId: entry.spec.id, currencyCode: entry.spec.currencyCode, price: entry.spec.price, term: termOf(entry.price) });
    } else {
      mismatched.push({
        itemPriceId: entry.spec.id,
        currencyCode: entry.spec.currencyCode,
        price: entry.spec.price,
        term: termOf(entry.price),
        diffs,
        sellableNow: itemPriceMatches(existing, entry.price),
      });
    }
  }

  const toCreate: CatalogSyncAction[] = [];
  if (family.plan.action === "create" && family.familyId) {
    toCreate.push({ kind: "item_family", params: { id: family.familyId, name: "SkipWait" } });
  }
  const existingItemIds = new Set(state.items.map(item => item.id));
  const seenItems = new Set<string>();
  for (const entry of planned) {
    if (existingItemIds.has(entry.item.id) || seenItems.has(entry.item.id)) continue;
    seenItems.add(entry.item.id);
    toCreate.push({
      kind: "item",
      params: {
        id: entry.item.id,
        name: entry.item.name,
        type: entry.item.type,
        itemFamilyId: family.familyId,
        externalName: entry.item.externalName,
        enabledInPortal: entry.item.enabledInPortal,
      },
    });
  }
  for (const entry of planned) toCreate.push({ kind: "item_price", params: entry.spec });

  const extras = extrasOf(desired, state);
  const counts = {
    desired: desired.length,
    correct: correct.length,
    mismatched: mismatched.length,
    blocked: blocked.length,
    toCreate: toCreate.length,
    itemPricesToCreate: planned.length,
    extras: extras.length,
    excluded: excluded.length,
  };

  // The hash pins the classification, not the raw provider payload: list order,
  // updated_at/resource_version and checkedAt never move it (D-069 stale check).
  const canonical = { version: 1, site, environment, family: family.plan, toCreate, correct, mismatched, blocked, extras, excluded, counts };
  const planHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

  return {
    version: 1,
    site,
    environment,
    checkedAt: checkedAt.toISOString(),
    planHash,
    family: family.plan,
    toCreate,
    correct,
    mismatched,
    blocked,
    extras,
    excluded: [...excluded],
    counts,
  };
}
