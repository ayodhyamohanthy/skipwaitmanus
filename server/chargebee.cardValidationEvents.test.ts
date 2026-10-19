// D-079: the Chargebee payment-source events that mark a card validated.
import { describe, expect, it } from "vitest";
import { parsePaymentSourceEvent } from "./chargebee";

const payload = (over: Record<string, unknown> = {}) => ({
  id: "ev_ps_1",
  event_type: "payment_source_added",
  content: { payment_source: { id: "pm_1", customer_id: "cb_cust_1", status: "valid", type: "card" } },
  ...over,
});

describe("parsePaymentSourceEvent (D-079)", () => {
  it("parses payment_source_added and payment_source_updated", () => {
    expect(parsePaymentSourceEvent(payload())).toEqual({ eventId: "ev_ps_1", eventType: "payment_source_added", customerId: "cb_cust_1", paymentSourceId: "pm_1", status: "valid" });
    expect(parsePaymentSourceEvent(payload({ event_type: "payment_source_updated" }))).toMatchObject({ eventType: "payment_source_updated" });
  });
  it("ignores deletions, other events and malformed payloads", () => {
    expect(parsePaymentSourceEvent(payload({ event_type: "payment_source_deleted" }))).toBeUndefined();
    expect(parsePaymentSourceEvent(payload({ event_type: "payment_succeeded" }))).toBeUndefined();
    expect(parsePaymentSourceEvent({})).toBeUndefined();
    expect(parsePaymentSourceEvent({ id: "ev", event_type: "payment_source_added", content: {} })).toBeUndefined();
    expect(parsePaymentSourceEvent({ id: "ev", event_type: "payment_source_added", content: { payment_source: { id: "pm_1", status: "valid" } } })).toBeUndefined();
  });
});
