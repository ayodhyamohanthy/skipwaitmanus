// The only Chargebee surface the catalog sync may touch (D-069): list and
// create item families, items and item prices. No update, archive or delete; no
// subscription, customer, invoice, transaction or hosted-page endpoint.
import { z } from "zod";
import type { ItemPriceSpec } from "../shared/catalogSync";
import { ChargebeeApiError, chargebeeRequest, type ChargebeeCredentials } from "./chargebeeApi";
import type { ItemSpec } from "./catalogSyncDesired";
import type { ProviderFamily, ProviderItem, ProviderItemPrice } from "./catalogSyncPlan";

export class CatalogListTooLongError extends Error {
  constructor(path: string) {
    super(`Chargebee returned more than 10 pages of ${path}`);
    this.name = "CatalogListTooLongError";
  }
}

const familySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
});

const itemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  item_family_id: z.string().optional(),
  enabled_for_checkout: z.boolean().optional(),
  external_name: z.string().optional(),
});

const itemPriceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  item_id: z.string().optional(),
  item_family_id: z.string().optional(),
  item_type: z.string().optional(),
  status: z.string().optional(),
  currency_code: z.string().optional(),
  price: z.number().optional(),
  pricing_model: z.string().optional(),
  period: z.number().optional(),
  period_unit: z.string().optional(),
  billing_cycles: z.number().optional(),
});

const familyListSchema = z.object({ list: z.array(z.object({ item_family: familySchema })), next_offset: z.string().optional() });
const itemListSchema = z.object({ list: z.array(z.object({ item: itemSchema })), next_offset: z.string().optional() });
const itemPriceListSchema = z.object({ list: z.array(z.object({ item_price: itemPriceSchema })), next_offset: z.string().optional() });
const familyCreateSchema = z.object({ item_family: familySchema });
const itemCreateSchema = z.object({ item: itemSchema });
const itemPriceCreateSchema = z.object({ item_price: itemPriceSchema });

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export type CatalogApi = {
  listItemFamilies(): Promise<ProviderFamily[]>;
  listItems(filter: { idPrefix: string }): Promise<ProviderItem[]>;
  listItemPrices(filter: { idPrefix: string } | { itemIds: string[] }): Promise<ProviderItemPrice[]>;
  createItemFamily(input: { id: string; name: string }): Promise<ProviderFamily>;
  createItem(input: ItemSpec & { itemFamilyId: string | null }): Promise<ProviderItem>;
  createItemPrice(spec: ItemPriceSpec): Promise<ProviderItemPrice>;
};

function invalidResponse(): ChargebeeApiError {
  return new ChargebeeApiError(502, "invalid_response", null, "Chargebee returned an unexpected response");
}

/** The documented form fields for one item; `enabled_in_portal` only for plans. */
export function itemForm(input: ItemSpec & { itemFamilyId: string | null }): URLSearchParams {
  const form = new URLSearchParams({ id: input.id, name: input.name, type: input.type });
  if (input.itemFamilyId) form.set("item_family_id", input.itemFamilyId);
  form.set("external_name", input.externalName);
  if (input.type === "plan" && input.enabledInPortal !== null) form.set("enabled_in_portal", String(input.enabledInPortal));
  return form;
}

/** The documented form fields for one item price: no period on a one-time charge; recurring addons (D-132 monthly credits rung) carry a period like plans. */
export function itemPriceForm(spec: ItemPriceSpec): URLSearchParams {
  const form = new URLSearchParams({
    id: spec.id,
    name: spec.name,
    item_id: spec.itemId,
    pricing_model: spec.pricingModel,
    price: String(spec.price),
    currency_code: spec.currencyCode,
    external_name: spec.externalName,
  });
  if (spec.itemType === "plan" || spec.itemType === "addon") {
    if (spec.period !== null) form.set("period", String(spec.period));
    if (spec.periodUnit !== null) form.set("period_unit", spec.periodUnit);
    if (spec.billingCycles !== null) form.set("billing_cycles", String(spec.billingCycles));
  }
  return form;
}

async function listPages<T>(
  credentials: ChargebeeCredentials,
  path: string,
  filter: URLSearchParams,
  read: (body: unknown) => { rows: T[]; nextOffset?: string },
): Promise<T[]> {
  const rows: T[] = [];
  let offset: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams(filter);
    query.set("limit", String(PAGE_LIMIT));
    if (offset) query.set("offset", offset);
    const body = await chargebeeRequest(credentials, { method: "GET", path, query }, z.unknown());
    const { rows: answered, nextOffset } = read(body);
    rows.push(...answered);
    if (!nextOffset) return rows;
    offset = nextOffset;
  }
  throw new CatalogListTooLongError(path);
}

export function createChargebeeCatalogApi(credentials: ChargebeeCredentials): CatalogApi {
  return {
    async listItemFamilies() {
      return listPages(credentials, "/item_families", new URLSearchParams(), body => {
        const parsed = familyListSchema.safeParse(body);
        if (!parsed.success) throw invalidResponse();
        return { rows: parsed.data.list.map(row => row.item_family), nextOffset: parsed.data.next_offset };
      });
    },
    async listItems(filter) {
      return listPages(credentials, "/items", new URLSearchParams({ "id[starts_with]": filter.idPrefix }), body => {
        const parsed = itemListSchema.safeParse(body);
        if (!parsed.success) throw invalidResponse();
        return { rows: parsed.data.list.map(row => row.item), nextOffset: parsed.data.next_offset };
      });
    },
    async listItemPrices(filter) {
      const search = "idPrefix" in filter
        ? new URLSearchParams({ "id[starts_with]": filter.idPrefix })
        : new URLSearchParams({ "item_id[in]": JSON.stringify(filter.itemIds) });
      return listPages(credentials, "/item_prices", search, body => {
        const parsed = itemPriceListSchema.safeParse(body);
        if (!parsed.success) throw invalidResponse();
        return { rows: parsed.data.list.map(row => row.item_price), nextOffset: parsed.data.next_offset };
      });
    },
    async createItemFamily(input) {
      const parsed = await chargebeeRequest(credentials, { method: "POST", path: "/item_families", form: new URLSearchParams({ id: input.id, name: input.name }) }, familyCreateSchema);
      return parsed.item_family;
    },
    async createItem(input) {
      const parsed = await chargebeeRequest(credentials, { method: "POST", path: "/items", form: itemForm(input) }, itemCreateSchema);
      return parsed.item;
    },
    async createItemPrice(spec) {
      const parsed = await chargebeeRequest(credentials, { method: "POST", path: "/item_prices", form: itemPriceForm(spec) }, itemPriceCreateSchema);
      return parsed.item_price;
    },
  };
}
