import { describe, expect, it, vi } from "vitest";
import { revokeHostedSessions } from "./hostedSessionRevoke";


describe("revokeHostedSessions (sign-out ends the hosted AuthKit session)", () => {
  it("revokes only the active hosted sessions of the signed-out user", async () => {
    const revokeSession = vi.fn(async () => {});
    const listSessions = vi.fn(async () => ({ data: [{ id: "session_a", status: "active" }, { id: "session_b", status: "expired" }, { id: "session_c", status: "revoked" }, { id: "session_d" }] }) as never);
    const outcome = await revokeHostedSessions({ listSessions, revokeSession }, ["user_01"]);
    expect(listSessions).toHaveBeenCalledWith("user_01");
    expect(revokeSession.mock.calls.map(call => (call as unknown as [{ sessionId: string }])[0].sessionId)).toEqual(["session_a", "session_d"]);
    expect(outcome).toEqual({ revoked: 2, failed: 0 });
  });
  it("never throws when WorkOS fails and keeps going", async () => {
    const revokeSession = vi.fn(async ({ sessionId }: { sessionId: string }) => { if (sessionId === "s1") throw new Error("boom"); });
    const listSessions = vi.fn(async (userId: string) => { if (userId === "user_bad") throw new Error("down"); return { data: [{ id: "s1", status: "active" }, { id: "s2", status: "active" }] } as never; });
    const outcome = await revokeHostedSessions({ listSessions, revokeSession }, ["user_bad", "user_ok"]);
    expect(outcome).toEqual({ revoked: 1, failed: 2 });
  });
  it("is a no-op without an API or without linked users", async () => {
    expect(await revokeHostedSessions(undefined, ["user_1"])).toEqual({ revoked: 0, failed: 0 });
    const listSessions = vi.fn();
    expect(await revokeHostedSessions({ listSessions, revokeSession: vi.fn() } as never, [])).toEqual({ revoked: 0, failed: 0 });
    expect(listSessions).not.toHaveBeenCalled();
  });
  it("gives up after the timeout so sign-out is never held up", async () => {
    vi.useFakeTimers();
    const listSessions = vi.fn(() => new Promise(() => {}));
    const pending = revokeHostedSessions({ listSessions: listSessions as never, revokeSession: vi.fn() }, ["user_1"], { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toEqual({ revoked: 0, failed: 0 });
    vi.useRealTimers();
  });
});
