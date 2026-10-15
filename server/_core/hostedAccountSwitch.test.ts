import { describe, expect, it, vi } from "vitest";
import { readHostedLink, revokeHostedSessionOnAccountSwitch, signHostedLink, type AccountSwitchApi } from "./hostedAccountSwitch";

const key = new TextEncoder().encode("k".repeat(32));
const link = { uid: "user_A1", sid: "session_A1" };

describe("hosted link cookie", () => {
  it("round-trips, and rejects tampering, another key and malformed ids", async () => {
    const token = (await signHostedLink(link, key))!;
    expect(await readHostedLink(token, key)).toEqual(link);
    expect(await readHostedLink(token + "x", key)).toBeNull();
    expect(await readHostedLink(token, new TextEncoder().encode("z".repeat(32)))).toBeNull();
    expect(await readHostedLink(undefined, key)).toBeNull();
    expect(await signHostedLink({ uid: "nope", sid: "session_1" }, key)).toBeNull();
  });
});

function api(over: Partial<AccountSwitchApi> = {}): AccountSwitchApi & { revokeSession: ReturnType<typeof vi.fn> } {
  return { listUsers: vi.fn(async () => ({ data: [{ id: "user_B2" }] })), revokeSession: vi.fn(async () => undefined), ...over } as never;
}

describe("revokeHostedSessionOnAccountSwitch", () => {
  it("revokes only the linked session when the typed email is a different user", async () => {
    const a = api();
    expect(await revokeHostedSessionOnAccountSwitch(a, link, "b@example.com")).toBe(true);
    expect(a.revokeSession).toHaveBeenCalledWith({ sessionId: "session_A1" });
    expect(a.listUsers).toHaveBeenCalledWith({ email: "b@example.com" });
  });
  it("revokes when the typed email belongs to nobody yet (a new sign-up must not inherit the old account)", async () => {
    const a = api({ listUsers: vi.fn(async () => ({ data: [] })) });
    expect(await revokeHostedSessionOnAccountSwitch(a, link, "new@example.com")).toBe(true);
  });
  it("does nothing when the typed email is the same account", async () => {
    const a = api({ listUsers: vi.fn(async () => ({ data: [{ id: "user_A1" }] })) });
    expect(await revokeHostedSessionOnAccountSwitch(a, link, "a@example.com")).toBe(false);
    expect(a.revokeSession).not.toHaveBeenCalled();
  });
  it("does nothing without a verified link, a typed email, or an api", async () => {
    const a = api();
    expect(await revokeHostedSessionOnAccountSwitch(a, null, "b@example.com")).toBe(false);
    expect(await revokeHostedSessionOnAccountSwitch(a, link, "")).toBe(false);
    expect(await revokeHostedSessionOnAccountSwitch(undefined, link, "b@example.com")).toBe(false);
    expect(a.listUsers).not.toHaveBeenCalled();
  });
  it("is fail-soft: lookup or revoke errors and timeouts just return false", async () => {
    expect(await revokeHostedSessionOnAccountSwitch(api({ listUsers: async () => { throw new Error("down"); } }), link, "b@example.com")).toBe(false);
    expect(await revokeHostedSessionOnAccountSwitch(api({ revokeSession: async () => { throw new Error("gone"); } }), link, "b@example.com")).toBe(false);
    const log = vi.fn();
    expect(await revokeHostedSessionOnAccountSwitch(api({ listUsers: () => new Promise(() => undefined) }), link, "b@example.com", { timeoutMs: 20, log })).toBe(false);
    expect(log).toHaveBeenCalled();
  });
});
