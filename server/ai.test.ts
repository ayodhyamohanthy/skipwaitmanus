import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProactiveBrief,
  draftHiringManagerEmail,
  draftReferralPitch,
  draftSmartReferralPitch,
  matchReferrers,
  runCareerCopilot,
  smartPitchFallback,
  summarizeReferralFit,
} from "./ai";

const AI_KEYS = ["AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_KEY", "AI_MODEL"] as const;

const context = {
  jobs: [{ id: 1, title: "Staff Engineer", company: "Acme", location: "Bengaluru", seniority: "staff", workMode: "hybrid", description: "Platform team" }],
  referrers: [
    { userId: 11, name: "Aditi", company: "Acme", title: "Staff Engineer", expertise: "platform", capacity: 2 },
    { userId: 12, name: "Bhavna", company: "Acme", title: "EM", expertise: "infra", capacity: 0 },
  ],
  savedRoles: [{ title: "Staff Engineer", company: "Acme", seniority: "staff" }],
  referrals: [{ jobTitle: "Staff Engineer", company: "Acme", status: "awaiting_review", updatedAt: null }],
  recentMessageCount: 3,
  stats: { savedRoles: 1, activeReferralRequests: 1, incomingReferralRequests: 0, introductionsMade: 0, conversationsStarted: 1, peopleHired: 0 },
};

function provider(handler: () => Promise<unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls.push("called");
    return handler();
  }));
  return calls;
}

const completion = (content: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

beforeEach(() => {
  for (const key of AI_KEYS) delete process.env[key];
  Object.assign(process.env, { AI_PROVIDER_BASE_URL: "https://api.example.test/v1", AI_PROVIDER_API_KEY: "sk_ai_test_key", AI_MODEL: "model-from-config" });
});

afterEach(() => {
  for (const key of AI_KEYS) delete process.env[key];
  vi.unstubAllGlobals();
});

describe("AI features under provider outage", () => {
  beforeEach(() => provider(async () => { throw new Error("ETIMEDOUT"); }));

  it("still answers with the built-in copy instead of failing the screen", async () => {
    await expect(runCareerCopilot({ message: "What should I do next?", context })).resolves.toMatch(/tell me which goal/i);
    await expect(draftReferralPitch({ jobTitle: "Staff Engineer", company: "Acme", referrerName: "Aditi", notes: "I have shipped platform work" })).resolves.toMatch(/interested in the Staff Engineer role at Acme/);
    await expect(draftHiringManagerEmail({ candidateName: "Priya", targetRoleUrl: "https://jobs.acme.test/1" })).resolves.toMatch(/^Subject: Referral — Priya/);
    await expect(summarizeReferralFit({ candidateName: "Priya", jobTitle: "Staff Engineer", company: "Acme", personalPitch: "I ship platforms" })).resolves.toMatch(/Evidence of fit/);
    const brief = await createProactiveBrief({ context });
    expect(brief.items).toHaveLength(3);
    expect(brief.items[0].action).toBe("Explore with Copilot");
  });

  it("matches only against the referrers the member can actually see", async () => {
    const matches = await matchReferrers({ jobTitle: "Staff Engineer", company: "Acme", context });
    expect(matches.matches.map(match => match.userId)).toEqual([11]);
    expect(matches.strategy).toMatch(/capacity to review|expertise/i);
  });
});

describe("referrer matching against a model answer", () => {
  it("drops a Referrer the model invented and one with no capacity", async () => {
    provider(async () => completion(JSON.stringify({
      strategy: "Ask Aditi first.",
      matches: [
        { userId: 99999, name: "Someone Not In Your Network", rationale: "A strong match." },
        { userId: 12, name: "Bhavna", rationale: "She has capacity." },
        { userId: 11, name: "Aditi", rationale: "Platform expertise and two slots." },
      ],
    })));
    const matches = await matchReferrers({ jobTitle: "Staff Engineer", company: "Acme", context });
    expect(matches.matches).toEqual([{ userId: 11, name: "Aditi", rationale: "Platform expertise and two slots." }]);
    expect(matches.strategy).toBe("Ask Aditi first.");
  });

  it("falls back to the deterministic ranking when the model answers in prose", async () => {
    provider(async () => completion("I would suggest reaching out to your network."));
    const matches = await matchReferrers({ jobTitle: "Staff Engineer", company: "Acme", context });
    expect(matches.matches.map(match => match.userId)).toEqual([11]);
  });
});

describe("proactive brief against a model answer", () => {
  it("refuses to render an item the model left a field out of", async () => {
    provider(async () => completion(JSON.stringify({ items: [
      { title: "Review your strongest saved role", body: "You have one saved role in view.", action: "Explore with Copilot" },
      { title: "Move one request forward", action: "Review pathways" },
      { title: "Prepare for your conversation", body: "Three messages are waiting.", action: "Open messages" },
    ] })));
    const brief = await createProactiveBrief({ context });
    expect(JSON.stringify(brief)).not.toMatch(/undefined/);
    expect(brief.items).toHaveLength(3);
  });
});

describe("pitch drafting boundaries", () => {  it("stays fully offline without an attached PDF resume", async () => {
    const calls = provider(async () => completion("should never be used"));
    const input = { companyDomain: "acme.com", targetRoleUrl: "https://jobs.acme.com/staff" };
    await expect(draftSmartReferralPitch(input)).resolves.toBe(smartPitchFallback(input));
    await expect(draftSmartReferralPitch({ ...input, resumeUrl: "https://files.test/r.docx", resumeMimeType: "application/msword" })).resolves.toBe(smartPitchFallback(input));
    expect(calls).toEqual([]);
  });
});
