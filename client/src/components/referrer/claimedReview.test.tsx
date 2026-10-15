// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimedReview, type ClaimedCompanyRequest } from "./ClaimedReview";

afterEach(() => { cleanup(); });

function renderReview(request: ClaimedCompanyRequest) {
  const onDecide = vi.fn();
  render(<ClaimedReview request={request} activeDocument={0} setActiveDocument={() => undefined} message="" setMessage={() => undefined} deciding={false} error="" onDecide={onDecide} />);
  return { onDecide };
}

const base = { id: 901, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", candidateName: null };

describe("legacy claimed review (/referrer?request=:id)", () => {
  it("before acceptance shows locked files as a count, with no file name, link or preview, and still lets the referrer approve", () => {
    const { onDecide } = renderReview({ ...base, attachments: [{ id: 31, mimeType: "application/pdf", fileSize: 10 }] });
    expect(screen.getByText("Candidate is requesting your referral")).toBeTruthy();
    expect(screen.getByText("1 attached")).toBeTruthy();
    expect(screen.getByText("Resume ready after acceptance")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Approve referral/ }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });

  it("previews a named, linked file as before", () => {
    renderReview({ ...base, candidateName: "Asha R.", attachments: [{ id: 31, fileName: "Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: "/api/documents/31" }] });
    expect(screen.getByText("Asha R. is requesting your referral")).toBeTruthy();
    expect(screen.getByText("Viewing Resume.pdf")).toBeTruthy();
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe("/api/documents/31");
    expect(screen.queryByText(/Resume access has ended/)).toBeNull();
  });

  it("after acceptance, a named file without a link says access ended, never 'ready after acceptance'", () => {
    renderReview({ ...base, candidateName: "Asha R.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: null }] });
    expect(screen.getByText("Asha_R_Resume.pdf")).toBeTruthy();
    expect(screen.getByText("Resume access has ended. Message the Job Seeker in your private conversation if you still need it.")).toBeTruthy();
    expect(screen.queryByText("Resume ready after acceptance")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("a locked file without an id (current wire shape) still counts and reads 'ready after acceptance'", () => {
    renderReview({ ...base, attachments: [{ mimeType: "application/pdf", fileSize: 10 }] });
    expect(screen.getByText("1 attached")).toBeTruthy();
    expect(screen.getByText("Resume ready after acceptance")).toBeTruthy();
    expect(screen.queryByText(/Resume access has ended/)).toBeNull();
  });
});
