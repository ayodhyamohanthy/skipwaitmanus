// Deterministic in-memory stand-in for the three Chargebee catalog endpoints the
// sync uses. Test support only: no network, no credentials, no secrets.
import type { ItemPriceSpec } from "../shared/catalogSync";
import type { CatalogApi } from "./chargebeeCatalogApi";
import { desiredCatalog, type ItemSpec } from "./catalogSyncDesired";
import type { CatalogSiteState, ProviderItem, ProviderItemPrice } from "./catalogSyncPlan";

export type FakeCatalogOptions = {
  failCreate?(call: { id: string; index: number }): Error | undefined;
  answerItemPrice?(created: ProviderItemPrice): ProviderItemPrice;
  beforeCreate?(): void | Promise<void>;
  failLists?: Error;
};

export type FakeCatalogApi = {
  api: CatalogApi;
  state: CatalogSiteState;
  calls: Array<{ method: string; id?: string }>;
  creates(): string[];
};

export function providerItemFor(item: ItemSpec, familyId: string | null, patch: Partial<ProviderItem> = {}): ProviderItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    status: "active",
    item_family_id: familyId ?? undefined,
    enabled_for_checkout: true,
    ...patch,
  };
}

export function providerItemPriceFor(spec: ItemPriceSpec): ProviderItemPrice {
  return {
    id: spec.id,
    name: spec.name,
    item_id: spec.itemId,
    item_type: spec.itemType,
    status: "active",
    currency_code: spec.currencyCode,
    price: spec.price,
    pricing_model: spec.pricingModel,
    ...(spec.period !== null ? { period: spec.period, period_unit: spec.periodUnit ?? undefined, billing_cycles: spec.billingCycles ?? undefined } : {}),
  };
}

/** A site where every sold price already exists exactly as the catalog says. */
export function syncedSiteState(): CatalogSiteState {
  const desired = desiredCatalog();
  const items: ProviderItem[] = [];
  const seen = new Set<string>();
  for (const entry of desired) {
    if (seen.has(entry.item.id)) continue;
    seen.add(entry.item.id);
    items.push(providerItemFor(entry.item, "skipwait_credits"));
  }
  return {
    families: [{ id: "skipwait_credits", name: "SkipWait Credits" }],
    items,
    itemPrices: desired.map(entry => providerItemPriceFor(entry.spec)),
  };
}

export function createFakeCatalogApi(seed?: CatalogSiteState, options: FakeCatalogOptions = {}): FakeCatalogApi {
  const state: CatalogSiteState = seed
    ? { families: [...seed.families], items: [...seed.items], itemPrices: [...seed.itemPrices] }
    : { families: [], items: [], itemPrices: [] };
  const calls: Array<{ method: string; id?: string }> = [];
  const created: string[] = [];
  let createIndex = 0;

  const list = <T>(method: string, result: T): T => {
    calls.push({ method });
    if (options.failLists) throw options.failLists;
    return result;
  };

  const beforeCreate = async (id: string): Promise<number> => {
    const index = createIndex;
    createIndex += 1;
    calls.push({ method: "create", id });
    await options.beforeCreate?.();
    const failure = options.failCreate?.({ id, index });
    if (failure) throw failure;
    return index;
  };

  const api: CatalogApi = {
    async listItemFamilies() {
      return list("listItemFamilies", state.families.map(family => ({ ...family })));
    },
    async listItems(filter) {
      const items = state.items.filter(item => item.id.startsWith(filter.idPrefix)).map(item => ({ ...item }));
      return list("listItems", items);
    },
    async listItemPrices(filter) {
      const prices = state.itemPrices
        .filter(price => ("idPrefix" in filter ? price.id.startsWith(filter.idPrefix) : filter.itemIds.includes(price.item_id ?? "")))
        .map(price => ({ ...price }));
      return list("listItemPrices", prices);
    },
    async createItemFamily(input) {
      await beforeCreate(input.id);
      const family = { id: input.id, name: input.name, status: "active" };
      state.families.push(family);
      created.push(input.id);
      return { ...family };
    },
    async createItem(input) {
      await beforeCreate(input.id);
      const item: ProviderItem = {
        id: input.id,
        name: input.name,
        type: input.type,
        status: "active",
        item_family_id: input.itemFamilyId ?? undefined,
        enabled_for_checkout: true,
        external_name: input.externalName,
      };
      state.items.push(item);
      created.push(input.id);
      return { ...item };
    },
    async createItemPrice(spec) {
      await beforeCreate(spec.id);
      const price = providerItemPriceFor(spec);
      const answered = options.answerItemPrice ? options.answerItemPrice(price) : price;
      state.itemPrices.push(answered);
      created.push(spec.id);
      return { ...answered };
    },
  };

  return { api, state, calls, creates: () => [...created] };
}
