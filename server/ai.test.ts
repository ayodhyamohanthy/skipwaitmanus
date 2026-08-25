import { beforeEach, describe, expect, it, vi } from "vitest";

const llm = vi.hoisted(() => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));

vi.mock("./_core/llm", () => llm);

import { createProactiveBrief, draftHiringManagerEmail, draftReferralPitch, draftSmartReferralPitch, hiringManagerEmailFallback, matchReferrers, runCareerCopilot, smartPitchFallback, summarizeReferralFit } from "./ai";

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

const emptyContext = {
  profile: null,
  jobs: [],
  referrers: [],
  savedRoles: [],
  referrals: [],
  recentMessageCount: 0,
  stats: { savedRoles: 0, activeReferralRequests: 0, incomingReferralRequests: 0, introductionsMade: 0, conversationsStarted: 0, peopleHired: 0 },
};

describe("Bridge AI drafting helpers", () => {
  beforeEach(() => {
    llm.invokeLLM.mockReset();
    llm.listLLMModels.mockReset();
    llm.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-4o" }, { id: "gpt-5-mini" }, { id: "gpt-5" }] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("prefers the gpt-5-mini model, caches the catalog lookup, and returns the trimmed model answer", async () => {
    llm.invokeLLM.mockResolvedValue(completion("  Focus on the saved role first.  "));

    expect(await runCareerCopilot({ message: "What next?", context: emptyContext })).toBe("Focus on the saved role first.");
    expect(await summarizeReferralFit({ candidateName: "Ada", jobTitle: "Engineer", company: "Acme", personalPitch: "I build tooling." })).toBe("Focus on the saved role first.");

    expect(llm.listLLMModels).toHaveBeenCalledTimes(1);
    expect(llm.invokeLLM.mock.calls[0][0].model).toBe("gpt-5-mini");
    expect(llm.invokeLLM.mock.calls[0][0].messages[1].content).toContain("Member request: What next?");
  });

  it("returns the honest offline fallback when the model fails or answers with nothing usable", async () => {
    llm.invokeLLM.mockRejectedValueOnce(new Error("upstream unavailable"));
    const failed = await draftReferralPitch({ jobTitle: "Engineer", company: "Acme", referrerName: "Sam", notes: "I shipped their SDK." });
    expect(failed).toContain("Hi Sam, I’m interested in the Engineer role at Acme.");
    expect(failed).toContain("I shipped their SDK.");

    llm.invokeLLM.mockResolvedValueOnce(completion("   "));
    expect(await summarizeReferralFit({ candidateName: "Ada", jobTitle: "Engineer", company: "Acme", personalPitch: "I build tooling." })).toContain("**Evidence of fit:**");
  });

  it("never sends a non-PDF resume to the model and returns the editable Smart Pitch fallback instead", async () => {
    const input = { companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/1", resumeUrl: "https://signed.example/resume.docx", resumeMimeType: "application/msword" };

    expect(await draftSmartReferralPitch(input)).toBe(smartPitchFallback(input));
    expect(await draftSmartReferralPitch({ companyDomain: "acme.com", targetRoleUrl: input.targetRoleUrl })).toBe(smartPitchFallback(input));
    expect(llm.invokeLLM).not.toHaveBeenCalled();
  });

  it("accepts a Smart Pitch draft only inside the reviewable word range and attaches the resume as untrusted data", async () => {
    const input = { companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/1", resumeUrl: "https://signed.example/resume.pdf", resumeMimeType: "application/pdf" };
    const inRange = `${"word ".repeat(99)}end`;

    llm.invokeLLM.mockResolvedValueOnce(completion(`  ${inRange}\n\n`));
    expect(await draftSmartReferralPitch(input)).toBe(inRange);

    const [request] = llm.invokeLLM.mock.calls[0];
    expect(request.messages[1].content[1].file_url).toEqual({ url: input.resumeUrl, mime_type: "application/pdf" });

    llm.invokeLLM.mockResolvedValueOnce(completion("Too short to review."));
    expect(await draftSmartReferralPitch(input)).toBe(smartPitchFallback(input));

    llm.invokeLLM.mockResolvedValueOnce(completion("word ".repeat(200)));
    expect(await draftSmartReferralPitch(input)).toBe(smartPitchFallback(input));

    llm.invokeLLM.mockRejectedValueOnce(new Error("generation failed"));
    expect(await draftSmartReferralPitch(input)).toBe(smartPitchFallback(input));
  });

  it("keeps a hiring-manager email general when the Referrer supplied no verified evidence", async () => {
    const withoutEvidence = hiringManagerEmailFallback({ candidateName: "Ada Lovelace", targetRoleUrl: "https://careers.acme.com/jobs/1" });
    expect(withoutEvidence).toContain("Subject: Referral — Ada Lovelace");
    expect(withoutEvidence).toContain("review their attached materials");

    const withEvidence = hiringManagerEmailFallback({ candidateName: "Ada Lovelace", targetRoleUrl: "https://careers.acme.com/jobs/1", accomplished: "cut build times", measuredBy: "CI duration", byDoing: "caching dependencies" });
    expect(withEvidence).toContain("Ada Lovelace cut build times, measured by CI duration, by caching dependencies.");

    llm.invokeLLM.mockResolvedValueOnce(completion(""));
    expect(await draftHiringManagerEmail({ candidateName: "Ada Lovelace", targetRoleUrl: "https://careers.acme.com/jobs/1" })).toBe(withoutEvidence);
    expect(llm.invokeLLM.mock.calls[0][0].messages[1].content).toContain("No verified accomplishment has been supplied.");
  });

  it("ranks only Referrers with review capacity and discards malformed match output", async () => {
    const context = {
      ...emptyContext,
      referrers: [
        { userId: 1, name: "Sam", company: "Acme", title: "Staff Engineer", expertise: "platform", capacity: 2 },
        { userId: 2, name: null, company: "Acme", title: "EM", expertise: "mobile", capacity: 1 },
        { userId: 3, name: "Busy", company: "Acme", title: "PM", expertise: "product", capacity: 0 },
        { userId: 4, name: "Spare", company: "Acme", title: "Designer", expertise: "design", capacity: 3 },
      ],
    };

    llm.invokeLLM.mockResolvedValueOnce(completion(JSON.stringify({ strategy: "Ask the platform Referrer first.", matches: [{ userId: 1, name: "Sam", rationale: "Closest platform expertise." }, { userId: "2", name: "Invalid", rationale: "Wrong id type." }] })));
    const ranked = await matchReferrers({ jobTitle: "Engineer", company: "Acme", context });
    expect(ranked.strategy).toBe("Ask the platform Referrer first.");
    expect(ranked.matches).toEqual([{ userId: 1, name: "Sam", rationale: "Closest platform expertise." }]);

    llm.invokeLLM.mockResolvedValueOnce(completion("not json at all"));
    const fallback = await matchReferrers({ jobTitle: "Engineer", company: "Acme", context });
    expect(fallback.matches).toHaveLength(3);
    expect(fallback.matches.map(match => match.userId)).toEqual([1, 2, 4]);
    expect(fallback.matches[1].name).toBe("Available Referrer");
  });

  it("builds a proactive brief from real workspace counts and rejects a brief without exactly three items", async () => {
    const context = { ...emptyContext, savedRoles: [{ title: "Engineer", company: "Acme", seniority: "senior" }], referrals: [{ jobTitle: "Engineer", company: "Acme", status: "pending", updatedAt: null }], recentMessageCount: 2 };

    llm.invokeLLM.mockResolvedValueOnce(completion(JSON.stringify({ items: [{ title: "One", body: "First", action: "Go" }, { title: "Two", body: "Second", action: "Go" }] })));
    const fallback = await createProactiveBrief({ context });
    expect(fallback.items).toHaveLength(3);
    expect(fallback.items[0].body).toContain("You have 1 saved role.");
    expect(fallback.items[1].body).toContain("1 active or historical Referral Request");
    expect(fallback.items[2].body).toContain("There are 2 messages");

    llm.invokeLLM.mockResolvedValueOnce(completion(JSON.stringify({ items: [{ title: "One", body: "First", action: "Open" }, { title: "Two", body: "Second", action: "Open" }, { title: "Three", body: "Third", action: "Open" }] })));
    const accepted = await createProactiveBrief({ context });
    expect(accepted.items.map(item => item.title)).toEqual(["One", "Two", "Three"]);

    const emptyBrief = await createProactiveBrief({ context: emptyContext });
    expect(emptyBrief.items[0].title).toBe("Set your direction");
    expect(emptyBrief.items[2].body).toContain("Bridge will surface conversation context");
  });
});
