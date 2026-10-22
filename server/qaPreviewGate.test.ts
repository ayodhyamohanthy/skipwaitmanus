import { beforeEach, describe, expect, it, vi } from "vitest";
const dispatch = vi.hoisted(() => vi.fn(async () => new Response("ok")));
vi.mock("@cloudflare/containers", () => ({ Container: class {}, getContainer: vi.fn(() => ({})) }));
vi.mock("../src/containerRecovery", () => ({ fetchContainerWithStoppedRecovery: dispatch, fetchContainerReplayingIdempotent: dispatch }));
import worker from "../src/worker";
const call = (env: Record<string, unknown>, host = "skipwait-qa.test.workers.dev", auth?: string) => worker.fetch(new Request(`https://${host}/`, { headers: auth ? { Authorization: auth } : {} }), { SkipwaitApi: {} as never, ...env }, {} as never);
describe("isolated QA preview", () => {
  beforeEach(() => dispatch.mockClear());
  it("fails closed before the gate secret is provisioned", async () => {
    expect((await call({ QA_PREVIEW: "true" })).status).toBe(503);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("requires Basic Auth for every preview request", async () => {
    const env = { QA_PREVIEW: "true", QA_GATE_SECRET: "fictional-test-only" };
    const denied = await call(env);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain("Basic");
    expect(dispatch).not.toHaveBeenCalled();
    const ok = await call(env, undefined, "Basic " + btoa("qa:fictional-test-only"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
  it("keeps production's workers.dev origin closed", async () => {
    expect((await call({})).status).toBe(404);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("never accepts the QA path on the prod hostname", async () => {
    expect((await call({ QA_PREVIEW: "true", QA_GATE_SECRET: "test" }, "skipwait.me", "Basic " + btoa("qa:test"))).status).toBe(404);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
