// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as provenance from "./modelProvenance.mjs";
import { parseMarker, pickNextTask } from "./nextTaskCore.mjs";
import { reviewGateViolation } from "./review-gate.mjs";

const P = provenance as Record<string, any>;
const A = "a".repeat(40), B = "b".repeat(40);
const task = { id: "T", tier: 1, branch: "agent/queue/t" };
const raw = `\x1eClaim T: Operator · b\x1fprovenance route-builder\x1d\n`;

describe("truthful coding-model provenance composition", () => {
  it("retains marker body and commit identity in the shared loader, unlike subject-only parsing", () => {
    expect(parseMarker("Claim T: Operator · b")).toEqual({ verb: "Claim", id: "T", who: "Operator · b" });
    const records = P.parseProvenanceLog(raw);
    expect(records[0].body).toBe("provenance route-builder");
    expect(P.routeReference(records[0].body)).toBe("route-builder");
  });
  it("never equates an operator name with the external model it runs", () => {
    expect(P.routeIdentity({ version: 1, routes: [], executions: [] }, "route-builder", "Operator · b", "T", "build").ok).toBe(false);
  });
  it("fails closed on malformed external provenance, not legacy fallthrough", () => {
    for (const body of ["provenance", "provenance x\nprovenance y", "provenance ../escape", "provenance x\nexecution x\nexecution y"]) {
      expect(P.markerReferences(body).invalid).toBe(true);
    }
  });
});
