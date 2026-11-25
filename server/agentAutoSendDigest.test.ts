import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentAutoSendDigest, type AgentAutoSendDigestDeps } from "./agentAutoSendDigest";

const NOW = new Date("2026-11-24T12:00:00.000Z");

afterEach(() => vi.unstubAllEnvs());

describe("SKIPPY-7: daily digest (tests 19, 20, 21)", () => {
  function makeFixture() {
    type Approval = { id: number; userId: number; status: string; decidedBy: string | null; companyDomain: string | null; decidedAt: Date };
    type Notification = { id: number; userId: number; kind: string; eventKey: string; title: string; body: string };
    type User = { id: number; email: string };

    const approvals: Approval[] = [];
    const notifications: Notification[] = [];
    const users: User[] = [
      { id: 7, email: "seeker7@example.com" },
      { id: 8, email: "seeker8@example.com" },
    ];
    const emailsSent: Array<{ to: string; subject: string; text: string }> = [];

    let notifSeq = 1;

    const fakeDb = {
      select: (projection?: any) => ({
        from: (table: any) => ({
          where: (condition: any) => ({
            limit: (n: number) => {
              // users lookup
              const user = users.find(u => u.id === 7 || u.id === 8);
              return [user];
            },
            orderBy: () => {
              // approvals query
              const filtered = approvals.filter(
                a => a.decidedBy === "agent_auto" && a.status === "approved" && a.decidedAt >= new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
              );
              return Promise.resolve(filtered);
            },
            then: (resolve: any) => {
              const filtered = approvals.filter(
                a => a.decidedBy === "agent_auto" && a.status === "approved" && a.decidedAt >= new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
              );
              return Promise.resolve(filtered).then(resolve);
            },
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (row: any) => ({
          onDuplicateKeyUpdate: async () => {
            const existing = notifications.find(n => n.eventKey === row.eventKey);
            if (existing) {
              // Duplicate key update in MySQL -> affectedRows = 0 (or 2)
              return [{ affectedRows: 0 }];
            }
            notifications.push({ id: notifSeq++, ...row });
            return [{ affectedRows: 1 }];
          },
        }),
      }),
    };

    const deps: AgentAutoSendDigestDeps = {
      getDb: async () => fakeDb as any,
      sendEmail: async input => {
        emailsSent.push(input);
        return { sent: true };
      },
      now: () => NOW.getTime(),
    };

    return { approvals, notifications, users, emailsSent, deps };
  }

  it("two auto-sends in one day produce one digest email; running the job twice sends nothing twice", async () => {
    const fixture = makeFixture();
    // Two auto-sends for user 7 in the past 24 hours
    fixture.approvals.push(
      { id: 1, userId: 7, status: "approved", decidedBy: "agent_auto", companyDomain: "wipro.com", decidedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
      { id: 2, userId: 7, status: "approved", decidedBy: "agent_auto", companyDomain: "tcs.com", decidedAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000) },
    );

    const runner = createAgentAutoSendDigest(fixture.deps);
    const result1 = await runner({ nowMs: NOW.getTime(), windowKey: "2026-11-24T12:00Z" });

    expect(result1.processed).toBe(1);
    expect(result1.failed).toBe(0);
    expect(fixture.emailsSent).toHaveLength(1);
    expect(fixture.emailsSent[0].to).toBe("seeker7@example.com");

    // Running the job a second time in the same day sends nothing twice (idempotent notification eventKey)
    const result2 = await runner({ nowMs: NOW.getTime(), windowKey: "2026-11-24T13:00Z" });
    expect(result2.processed).toBe(0);
    expect(fixture.emailsSent).toHaveLength(1); // Still exactly 1
  });

  it("a user with no auto-sends gets no email", async () => {
    const fixture = makeFixture();
    // Approvals exist, but decidedBy is 'seeker' (manual approve), not 'agent_auto'
    fixture.approvals.push(
      { id: 3, userId: 7, status: "approved", decidedBy: "seeker", companyDomain: "wipro.com", decidedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
    );

    const runner = createAgentAutoSendDigest(fixture.deps);
    const result = await runner({ nowMs: NOW.getTime(), windowKey: "2026-11-24T12:00Z" });

    expect(result.processed).toBe(0);
    expect(fixture.emailsSent).toHaveLength(0);
  });

  it("the digest names only companies and a count, and links to /agents", async () => {
    // The link comes from the configured origin, never a hardcoded production host, so a TEST-site digest
    // links to the site that sent it. Stubbed here so the assertion cannot depend on the developer's .env.
    vi.stubEnv("PUBLIC_BASE_URL", "https://skipwait.me");
    vi.stubEnv("WORKOS_REDIRECT_URI", "");
    const fixture = makeFixture();
    fixture.approvals.push(
      { id: 10, userId: 7, status: "approved", decidedBy: "agent_auto", companyDomain: "wipro.com", decidedAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000) },
      { id: 11, userId: 7, status: "approved", decidedBy: "agent_auto", companyDomain: "infosys.com", decidedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
    );

    const runner = createAgentAutoSendDigest(fixture.deps);
    await runner({ nowMs: NOW.getTime(), windowKey: "2026-11-24T12:00Z" });

    expect(fixture.emailsSent).toHaveLength(1);
    const email = fixture.emailsSent[0];
    expect(email.text).toContain("2 referral requests");
    expect(email.text).toContain("wipro.com, infosys.com");
    expect(email.text).toContain("https://skipwait.me/agents");
    expect(email.text).toContain("turn auto-send off");
    // Ensure no secret or seeker private info is leaked
    expect(email.text).not.toContain("password");
    expect(email.text).not.toContain("credits");
  });
});
