import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { isReviewerOpenId, refuseReviewerExternalAction, REVIEWER_EXTERNAL_ACTION_REFUSAL } from "./reviewerLogin";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("reviewer isolation guard", () => {
  it("recognizes reviewer openIds only", () => {
    expect(isReviewerOpenId("reviewer_seeker")).toBe(true);
    expect(isReviewerOpenId("reviewer_admin")).toBe(true);
    expect(isReviewerOpenId("google:123")).toBe(false);
    expect(isReviewerOpenId("reviewer")).toBe(false);
    expect(isReviewerOpenId(undefined)).toBe(false);
    expect(isReviewerOpenId(null)).toBe(false);
  });
  it("refuses reviewer accounts with 403 and the fixed message", () => {
    const res = mockRes();
    expect(refuseReviewerExternalAction(res, "reviewer_employer")).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: REVIEWER_EXTERNAL_ACTION_REFUSAL });
  });
  it("passes real members through untouched", () => {
    const res = mockRes();
    expect(refuseReviewerExternalAction(res, "workos|user_1")).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
