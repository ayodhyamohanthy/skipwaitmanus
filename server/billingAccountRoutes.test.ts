import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerBillingAccountRoutes, type BillingAccountRouteDeps } from "./billingAccountRoutes";

const runtime = () => ({ environment: "test" as const, site: "fixture-test", apiKey: "fixture-key" });

const card = (patch: Record<string, unknown> = {}) => ({
  id: "ps_1", customer_id: "cust_1", type: "card", status: "valid",
  card: { brand: "visa", last4: "4242", expiry_month: 8, expiry_year: 2028 }, ...patch,
});

function app(deps: Partial<BillingAccountRouteDeps> = {}) {
  const server = express();
  server.use(express.json());
  registerBillingAccountRoutes(server, {
    resolveIdentity: async () => ({ account: { id: 7, name: "Ayu Rao" }, primaryEmail: { emailAddress: "ayu@example.com" } }),
    resolveRuntime: runtime,
    findCustomer: async () => undefined,
    saveCustomer: vi.fn(),
    setPaymentMethodOnFile: vi.fn(),
    listSources: async () => [],
    retrieveProviderCustomer: async () => ({ id: "cust_1", primaryPaymentSourceId: null }),
    createProviderCustomer: async () => "cust_new",
    createManagePage: async () => "https://skipwait-test.chargebee.com/hosted/ps_manage",
    ...deps,
  });
  return server;
}

describe("GET /api/billing/payment-methods", () => {
  it("refuses a caller who is not signed in", async () => {
    const response = await request(app({ resolveIdentity: async () => undefined })).get("/api/billing/payment-methods");
    expect(response.status).toBe(401);
  });

  it("reports no customer and records no card when the member never checked out", async () => {
    const setPaymentMethodOnFile = vi.fn();
    const response = await request(app({ setPaymentMethodOnFile })).get("/api/billing/payment-methods?role=job_seeker");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ methods: [], customer: false });
    expect(setPaymentMethodOnFile).toHaveBeenCalledWith(7, "job_seeker", null);
  });

  it("lists saved cards as labels, flags the default, and confirms the card on file", async () => {
    const setPaymentMethodOnFile = vi.fn();
    const response = await request(app({
      findCustomer: async () => "cust_1",
      listSources: async () => [card(), card({ id: "ps_2", type: "upi", card: undefined, upi: { vpa: "ayu@okhdfcbank" } })],
      retrieveProviderCustomer: async () => ({ id: "cust_1", primaryPaymentSourceId: "ps_1" }),
      setPaymentMethodOnFile,
    })).get("/api/billing/payment-methods?role=job_seeker");
    expect(response.status).toBe(200);
    expect(response.body.customer).toBe(true);
    expect(response.body.methods).toEqual([
      { id: "ps_1", type: "card", label: "Visa •••• 4242", detail: "Default · expires 08/28", isDefault: true },
      { id: "ps_2", type: "upi", label: "UPI · ayu@okhdfcbank", detail: "India only · AutoPay mandate", isDefault: false },
    ]);
    expect(setPaymentMethodOnFile).toHaveBeenCalledWith(7, "job_seeker", expect.any(Date));
    // Card data never leaves the provider: only the last four digits are ever returned.
    expect(JSON.stringify(response.body)).not.toMatch(/424242|cvv|expiry_month/);
  });

  it("clears the flag only when a successful read finds no usable source", async () => {
    const setPaymentMethodOnFile = vi.fn();
    const response = await request(app({
      findCustomer: async () => "cust_1",
      listSources: async () => [],
      setPaymentMethodOnFile,
    })).get("/api/billing/payment-methods");
    expect(response.status).toBe(200);
    expect(response.body.methods).toEqual([]);
    expect(setPaymentMethodOnFile).toHaveBeenCalledWith(7, "job_seeker", null);
  });

  it("keeps the flag when the provider cannot be reached, because unasked is not absent", async () => {
    const setPaymentMethodOnFile = vi.fn();
    const response = await request(app({
      findCustomer: async () => "cust_1",
      listSources: async () => { throw new Error("socket hang up"); },
      setPaymentMethodOnFile,
    })).get("/api/billing/payment-methods");
    expect(response.status).toBe(502);
    expect(setPaymentMethodOnFile).not.toHaveBeenCalled();
    expect(response.body.error).toMatch(/payment provider/i);
  });

  it("answers 503 rather than 500 when billing is not configured", async () => {
    const response = await request(app({
      findCustomer: async () => "cust_1",
      listSources: async () => { throw new Error("Chargebee API key/site is not configured"); },
    })).get("/api/billing/payment-methods");
    expect(response.status).toBe(503);
  });
});

describe("POST /api/billing/payment-methods/session", () => {
  it("creates a provider customer for a member who has never checked out, then opens the hosted page", async () => {
    const createProviderCustomer = vi.fn(async () => "cust_new");
    const saveCustomer = vi.fn();
    const response = await request(app({ createProviderCustomer, saveCustomer }))
      .post("/api/billing/payment-methods/session?role=job_seeker").send({ returnTo: "methods" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ url: "https://skipwait-test.chargebee.com/hosted/ps_manage" });
    expect(createProviderCustomer).toHaveBeenCalledWith(expect.anything(), { email: "ayu@example.com", firstName: "Ayu", lastName: "Rao" });
    expect(saveCustomer).toHaveBeenCalledWith({ userId: 7, role: "job_seeker", provider: "chargebee", site: "test", providerCustomerId: "cust_new" });
  });

  it("reuses the customer the member already has", async () => {
    const createProviderCustomer = vi.fn();
    const createManagePage = vi.fn(async () => "https://skipwait-test.chargebee.com/hosted/ps_manage");
    const response = await request(app({ findCustomer: async () => "cust_1", createProviderCustomer, createManagePage }))
      .post("/api/billing/payment-methods/session").send({ returnTo: "payment" });
    expect(response.status).toBe(200);
    expect(createProviderCustomer).not.toHaveBeenCalled();
    expect(createManagePage).toHaveBeenCalledWith(expect.anything(), { customerId: "cust_1", redirectUrl: expect.stringContaining("/billing?payment=payment") });
  });

  it("refuses a body it does not understand before touching the provider", async () => {
    const createManagePage = vi.fn();
    const response = await request(app({ findCustomer: async () => "cust_1", createManagePage }))
      .post("/api/billing/payment-methods/session").send({ returnTo: "somewhere-else" });
    expect(response.status).toBe(400);
    expect(createManagePage).not.toHaveBeenCalled();
  });
});
