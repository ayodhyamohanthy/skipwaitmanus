// @vitest-environment jsdom
// D-174-worldwide-discovery.company-context: the handoff is display-only context -
// one key, fresh TTL (mirroring ASK_PREFILL_TTL_MS), consumed on use. A malformed or
// stale payload reads as absent; storage refusal never throws into the page.
import { beforeEach, describe, expect, it } from "vitest";
import { ASK_PREFILL_TTL_MS } from "@/lib/askPrefill";
import { DISCOVERY_HANDOFF_KEY, clearDiscoveryHandoff, readDiscoveryHandoff, saveDiscoveryHandoff } from "./discoveryHandoff";

describe("the discovered-company handoff (display-only context)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a pick with name, domain and timestamp", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" }, 1_000);
    expect(readDiscoveryHandoff(1_500)).toEqual({ name: "Acme Corp", domain: "acme.example", at: 1_000 });
  });

  it("reads as absent once the shared prefill TTL has passed", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" }, 1_000);
    expect(readDiscoveryHandoff(1_000 + ASK_PREFILL_TTL_MS + 1)).toBeNull();
    expect(readDiscoveryHandoff(1_000 + ASK_PREFILL_TTL_MS)).not.toBeNull();
  });

  it("reads as absent on malformed JSON or an invalid shape", () => {
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, "not json");
    expect(readDiscoveryHandoff()).toBeNull();
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, JSON.stringify({ name: "", domain: "acme.example", at: 1 }));
    expect(readDiscoveryHandoff()).toBeNull();
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, JSON.stringify({ name: "Acme Corp", domain: "acme.example" }));
    expect(readDiscoveryHandoff()).toBeNull();
  });

  it("clear removes the key (consumed on use, and sign-out cleanup)", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" });
    clearDiscoveryHandoff();
    expect(localStorage.getItem(DISCOVERY_HANDOFF_KEY)).toBeNull();
    expect(readDiscoveryHandoff()).toBeNull();
  });

  it("a storage refusal on save does not throw", () => {
    const setter = window.localStorage.setItem;
    Object.defineProperty(window.localStorage, "setItem", { configurable: true, value: () => { throw new Error("denied"); } });
    try {
      expect(() => saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" })).not.toThrow();
    } finally {
      Object.defineProperty(window.localStorage, "setItem", { configurable: true, value: setter });
    }
  });
});
