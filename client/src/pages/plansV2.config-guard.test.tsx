// @vitest-environment jsdom
// D-132 audit item 8: the numbers on the plans page come from shared/planFamily.ts. Card bullets are
// hand-written text, so this pins each number in them to the config value; a config change that is
// not mirrored in the copy fails here.
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLAN_BENEFIT_CAPS } from "@shared/planFamily";
import PlansV2 from "./PlansV2";

afterEach(cleanup);

describe("PlansV2 numbers follow the config (D-132 item 8)", () => {
  it("card bullets match PLAN_BENEFIT_CAPS", () => {
    render(<PlansV2 book="INR" />);
    const ft = PLAN_BENEFIT_CAPS.fast_track, ins = PLAN_BENEFIT_CAPS.insider;
    expect(screen.getByText(`${ft.openAsks} open asks at once`)).toBeTruthy();
    expect(screen.getByText(`Ask coach ${ft.tools.ask_coach}/mo - profile check ${ft.tools.profile_check}/mo - tailoring ${ft.tools.resume_tailoring}/mo`)).toBeTruthy();
    expect(screen.getByText(`Follow-up drafts ${ft.tools.follow_up_drafts}/mo`)).toBeTruthy();
    expect(screen.getByText(`${ins.openAsks} open asks at once`)).toBeTruthy();
    expect(screen.getByText(`Research briefs ${ins.tools.company_brief}/mo - dossiers + mock interviews ${ins.tools.interview_dossier}/mo each`)).toBeTruthy();
    expect(ins.tools.interview_dossier).toBe(ins.tools.mock_interview);
    expect(screen.getByText(`Offer + salary coach ${ins.tools.offer_comparison}/mo each - smart timing`)).toBeTruthy();
  });

  it("the page source has no price literal: fees and rungs come from the config", () => {
    const src = readFileSync("client/src/pages/PlansV2.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/[₹$]\s?\d/);
    expect(src).not.toMatch(/\b(499|999|1299|5900|129900|49900)\b/);
  });
});
