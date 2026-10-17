// @vitest-environment jsdom
// The decline confirmation is where a referrer is told what happens to the
// seeker's credit, so its wording is a contract. A pass keeps the credit spent
// today (D-035 will make the reason decide), so the dialog may promise privacy
// and a reopen for a colleague — never a refund the code does not perform.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CandidatePreviewCard, declineReasonOptions, type CandidatePreview, type DeclineReason } from "./CandidatePreviewCard";

const preview: CandidatePreview = { id: 501, candidateName: null, candidateMessage: "I redesigned the review flow for our tech fest.", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", attachments: [] };
const noop = () => undefined;

const dialogFor = (reason: DeclineReason) => {
  render(<CandidatePreviewCard preview={preview} working={false} error="" raceError={false} pendingDecline={reason} onAccept={noop} onDecline={noop} onConfirmDecline={noop} onCancelDecline={noop} onRetry={noop} onBackToQueue={noop} />);
  return screen.getByRole("group", { name: "Confirm decline" });
};

afterEach(cleanup);

describe("referrer decline confirmation copy", () => {
  it.each(declineReasonOptions.map(option => [option.value] as const))("%s: promises privacy and a reopen, never a credit", reason => {
    const text = dialogFor(reason).textContent ?? "";
    expect(text).toContain("never your name");
    expect(text).toContain("The ask stays with your company");
    expect(text.toLowerCase()).not.toMatch(/credit|token|refund/);
  });

  it("keeps every reason's own hint in front of the confirm button", () => {
    for (const option of declineReasonOptions) {
      expect(dialogFor(option.value).textContent).toContain(option.hint);
      cleanup();
    }
  });
});
