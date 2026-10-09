import { describe, expect, it } from "vitest";
import { activityStamp, createdLabel, describeEvent, providerLabel, scopeSummary, timeAgo, timeLeft } from "./format";

const NOW = new Date(2026, 9, 8, 10, 0, 0).getTime();
const at = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();
const HOUR = 3600000;
const DAY = 24 * HOUR;

describe("assistant display helpers", () => {
  it("uses the kit's relative-time wording", () => {
    expect(timeAgo(at(10000), NOW)).toBe("just now");
    expect(timeAgo(at(2 * HOUR), NOW)).toBe("2 hours ago");
    expect(timeAgo(at(DAY + HOUR), NOW)).toBe("yesterday");
    expect(timeAgo(at(3 * DAY), NOW)).toBe("3 days ago");
    expect(timeAgo("not a date", NOW)).toBe("just now");
  });

  it("counts down approval expiry", () => {
    expect(timeLeft(new Date(NOW + 23.5 * HOUR).toISOString(), NOW)).toBe("23 h left");
    expect(timeLeft(new Date(NOW + 5 * 60000).toISOString(), NOW)).toBe("5 min left");
    expect(timeLeft(at(1000), NOW)).toBe("expired");
  });

  it("stamps activity like the kit: Today HH:MM, Yesterday, then a date", () => {
    expect(activityStamp(new Date(2026, 9, 8, 9, 44).toISOString(), NOW)).toBe("Today 09:44");
    expect(activityStamp(new Date(2026, 9, 7, 15, 0).toISOString(), NOW)).toBe("Yesterday");
    expect(activityStamp(new Date(2026, 9, 2, 12, 0).toISOString(), NOW)).toBe("2 Oct");
    expect(createdLabel(new Date(2026, 9, 8, 8, 0).toISOString(), NOW)).toBe("today");
    expect(createdLabel(new Date(2026, 9, 1, 8, 0).toISOString(), NOW)).toBe("1 Oct");
  });

  it("labels providers and scopes in kit wording", () => {
    expect(providerLabel("chatgpt")).toBe("ChatGPT");
    expect(providerLabel("ChatGPT")).toBe("ChatGPT");
    expect(providerLabel("assistant")).toBe("Your assistant");
    expect(providerLabel(null, "Fallback")).toBe("Fallback");
    expect(scopeSummary(["read", "draft", "send", "credits"])).toBe("Read · Draft · Send with approval · Credits with approval");
  });

  it("maps real activity rows without inventing details", () => {
    const base = { outcome: "success", resourceType: "assistant_approval", createdAt: at(HOUR) };
    expect(describeEvent({ ...base, action: "assistant.approval_approved", metadata: { kind: "credit_spend" } }, NOW)).toMatchObject({ what: "Asked to use credits", note: "Approved by you", blocked: false });
    expect(describeEvent({ ...base, action: "assistant.approval_requested", metadata: { kind: "ask_send", provider: "ChatGPT" } }, NOW)).toMatchObject({ who: "ChatGPT", what: "Drafted an ask", note: "" });
    expect(describeEvent({ ...base, resourceType: "assistant_token", action: "assistant.mcp.tool", outcome: "failure", metadata: { tool: "search_jobs" } }, NOW)).toMatchObject({ who: "API token", what: "Searched roles", note: "Did not complete", blocked: true });
    expect(describeEvent({ ...base, resourceType: "assistant_token", action: "assistant.mcp.denied", outcome: "denied", metadata: {} }, NOW)).toMatchObject({ blocked: true, note: "Blocked: your plan does not include assistants" });
    expect(describeEvent({ ...base, action: "assistant.something_new", metadata: {} }, NOW).what).toBe("assistant.something_new");
  });
});
