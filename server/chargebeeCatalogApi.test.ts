import { afterEach, describe, expect, it, vi } from "vitest";
import { ChargebeeApiError } from "./chargebeeApi";
import { CatalogListTooLongError, createChargebeeCatalogApi, itemForm, itemPriceForm } from "./chargebeeCatalogApi";
import { desiredCatalog } from "./catalogSyncDesired";

type Recorded = { url: string; method: string; body: URLSearchParams | null; authorization: string | null };

/** A stand-in for fetch that answers from `reply` and records every request. */
function recordFetch(reply: (request: Recorded) => { status?: number; body: object }) {
  const requests: Recorded[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const request: Recorded = { url: String(input), method: init?.method ?? "GET", body: init?.body instanceof URLSearchParams ? init.body : null, authorization: headers.get("authorization") };
    requests.push(request);
    const answer = reply(request);
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}

const api = () => createChargebeeCatalogApi({ site: "site", apiKey: "secret-key" });
const query = (url: string) => decodeURIComponent(new URL(url).search.slice(1)).split("&");
const spec = (id: string) => {
  const entry = desiredCatalog().find(candidate => candidate.spec.id === id);
  if (!entry) throw new Error(id);
  return entry;
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("chargebee catalog api", () => {
  it("lists with limit=100 and id[starts_with] or item_id[in] filters, follows next_offset and stops at the page cap", async () => {
    let page = 0;
    const requests = recordFetch(request => {
      if (request.url.includes("/item_prices")) {
        page += 1;
        return { body: { list: [{ item_price: { id: `skipwait_p${page}`, status: "active", ignored_field: true } }], ...(page === 1 ? { next_offset: "offset-2" } : {}) } };
      }
      return { body: { list: [{ item: { id: "skipwait_start", type: "plan", status: "active", item_family_id: "skipwait_credits" } }] } };
    });
    const prices = await api().listItemPrices({ idPrefix: "skipwait_" });
    expect(prices.map(price => price.id)).toEqual(["skipwait_p1", "skipwait_p2"]);
    expect(prices[0]).not.toHaveProperty("ignored_field");
    expect(query(requests[0].url)).toEqual(expect.arrayContaining(["limit=100", "id[starts_with]=skipwait_"]));
    expect(query(requests[1].url)).toEqual(expect.arrayContaining(["limit=100", "id[starts_with]=skipwait_", "offset=offset-2"]));
    expect(requests[0].authorization).toBe(`Basic ${Buffer.from("secret-key:").toString("base64")}`);

    await api().listItemPrices({ itemIds: ["skipwait_start", "skipwait_momentum"] });
    expect(query(requests[2].url)).toEqual(expect.arrayContaining(["limit=100", 'item_id[in]=["skipwait_start","skipwait_momentum"]']));
    const items = await api().listItems({ idPrefix: "skipwait_" });
    expect(items).toEqual([{ id: "skipwait_start", type: "plan", status: "active", item_family_id: "skipwait_credits" }]);
    expect(query(requests.at(-1)?.url ?? "")).toEqual(expect.arrayContaining(["limit=100", "id[starts_with]=skipwait_"]));
  });

  it("refuses to read past the page cap with a typed error instead of returning a partial list", async () => {
    const requests = recordFetch(() => ({ body: { list: [], next_offset: "more" } }));
    await expect(api().listItemFamilies()).rejects.toBeInstanceOf(CatalogListTooLongError);
    expect(requests).toHaveLength(10);
  });

  it("sends exactly the documented form fields for each create", async () => {
    const requests = recordFetch(request => {
      const id = request.body?.get("id") ?? "";
      if (request.url.endsWith("/item_families")) return { body: { item_family: { id, name: request.body?.get("name"), status: "active" } } };
      if (request.url.endsWith("/items")) return { body: { item: { id, type: request.body?.get("type"), status: "active" } } };
      return { body: { item_price: { id, status: "active", price: Number(request.body?.get("price")), currency_code: request.body?.get("currency_code") } } };
    });
    const client = api();
    await client.createItemFamily({ id: "skipwait", name: "skipwait.me" });
    const plan = spec("skipwait_start_90d-USD");
    const pack = spec("skipwait_pack_25-INR");
    await client.createItem({ ...plan.item, itemFamilyId: "skipwait" });
    await client.createItem({ ...pack.item, itemFamilyId: "skipwait" });
    await client.createItem({ ...pack.item, itemFamilyId: null });
    const created = await client.createItemPrice(plan.spec);
    await client.createItemPrice(pack.spec);
    expect(created).toMatchObject({ id: "skipwait_start_90d-USD", price: 1900, currency_code: "USD" });

    const fields = requests.map(request => Object.fromEntries(request.body ?? []));
    expect(fields[0]).toEqual({ id: "skipwait", name: "skipwait.me" });
    expect(fields[1]).toEqual({ id: "skipwait_start", name: "skipwait_start", type: "plan", item_family_id: "skipwait", external_name: "Start", enabled_in_portal: "false" });
    expect(fields[2]).toEqual({ id: "skipwait_pack_25", name: "skipwait_pack_25", type: "charge", item_family_id: "skipwait", external_name: "25 credits" });
    expect(fields[3]).toEqual({ id: "skipwait_pack_25", name: "skipwait_pack_25", type: "charge", external_name: "25 credits" });
    expect(fields[4]).toEqual({ id: "skipwait_start_90d-USD", name: "skipwait_start_90d-USD", item_id: "skipwait_start", pricing_model: "flat_fee", price: "1900", currency_code: "USD", external_name: "Start, 90 days", period: "3", period_unit: "month", billing_cycles: "1" });
    expect(fields[5]).toEqual({ id: "skipwait_pack_25-INR", name: "skipwait_pack_25-INR", item_id: "skipwait_pack_25", pricing_model: "per_unit", price: "247500", currency_code: "INR", external_name: "25 credits" });
    for (const form of fields) expect(form).not.toHaveProperty("is_taxable");
    expect(requests.every(request => request.method === "POST")).toBe(true);
    // The form builders are the single source of those fields.
    expect(Object.fromEntries(itemPriceForm(pack.spec))).toEqual(fields[5]);
    expect(Object.fromEntries(itemForm({ ...plan.item, itemFamilyId: "skipwait" }))).toEqual(fields[1]);
  });

  it("only ever calls the /item_families, /items and /item_prices collection endpoints", async () => {
    const requests = recordFetch(request => {
      if (request.method === "GET") return { body: { list: [] } };
      const id = request.body?.get("id") ?? "";
      if (request.url.endsWith("/item_families")) return { body: { item_family: { id } } };
      if (request.url.endsWith("/items")) return { body: { item: { id } } };
      return { body: { item_price: { id } } };
    });
    const client = api();
    await Promise.all([client.listItemFamilies(), client.listItems({ idPrefix: "skipwait_" }), client.listItemPrices({ idPrefix: "skipwait_" }), client.listItemPrices({ itemIds: ["skipwait_start"] })]);
    const entry = spec("skipwait_pack_2-INR");
    await client.createItemFamily({ id: "skipwait", name: "skipwait.me" });
    await client.createItem({ ...entry.item, itemFamilyId: "skipwait" });
    await client.createItemPrice(entry.spec);
    expect(requests).toHaveLength(7);
    for (const request of requests) {
      expect(request.url).toMatch(/^https:\/\/site\.chargebee\.com\/api\/v2\/(item_families|items|item_prices)(\?|$)/);
      expect(request.url).not.toMatch(/subscriptions|customers|invoices|transactions|hosted_pages|payment_sources|credit_notes|portal|refund|\/delete|\/archive/);
    }
    expect(Object.keys(client).sort()).toEqual(["createItem", "createItemFamily", "createItemPrice", "listItemFamilies", "listItemPrices", "listItems"]);
  });

  it("turns a provider refusal into a sanitized ChargebeeApiError", async () => {
    recordFetch(() => ({ status: 400, body: { api_error_code: "invalid_request", error_code: "param_wrong_value", message: "period_unit : The billing frequency is not configured\n" } }));
    const error = await api().createItemPrice(spec("skipwait_start_90d-INR").spec).catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(ChargebeeApiError);
    expect(error).toMatchObject({ status: 400, apiErrorCode: "invalid_request", errorCode: "param_wrong_value", providerMessage: "period_unit : The billing frequency is not configured " });
  });
});
