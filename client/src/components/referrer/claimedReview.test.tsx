// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimedReview, type ClaimedCompanyRequest } from "./ClaimedReview";

/*
 * D-019(e) on the legacy claimed review (/referrer?request=:id): before
 * acceptance the server sends files locked (no name, id or link) and the page
 * says the resume opens after acceptance; after acceptance a named file is
 * previewed while its link is active, and a named file without a link says
 * plainly that access has ended.
 */

afterEach(() => { cleanup(); });

function renderReview(request: ClaimedCompanyRequest) {
  const onDecide = vi.fn();
  render(<ClaimedReview request={request} activeDocument={0} setActiveDocument={() => undefined} message="" setMessage={() => undefined} deciding={false} error="" onDecide={onDecide} />);
  return { onDecide };
}

const base = { id: 901, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", candidateName: null };
const ACCESS_ENDED = "Resume access has ended. Message the Job Seeker in your private conversation if you still need it.";

describe("legacy claimed review (/referrer?request=:id)", () => {
  it("before acceptance shows locked files as a count with no file name, link or preview, and still lets the referrer approve", () => {
    const { onDecide } = renderReview({ ...base, attachments: [{ mimeType: "application/pdf", fileSize: 10 }] });
    expect(screen.getByText("Candidate is requesting your referral")).toBeTruthy();
    expect(screen.getByText("1 attached")).toBeTruthy();
    expect(screen.getByText("Resume ready after acceptance")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect(screen.queryByText(ACCESS_ENDED)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Approve referral/ }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });

  it("after acceptance, a named file without a link says access ended, never 'ready after acceptance'", () => {
    renderReview({ ...base, candidateName: "Asha R.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: null }] });
    expect(screen.getByText("Asha_R_Resume.pdf")).toBeTruthy();
    expect(screen.getByText(ACCESS_ENDED)).toBeTruthy();
    expect(screen.queryByText("Resume ready after acceptance")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("a named, linked file still previews as before", () => {
    renderReview({ ...base, candidateName: "Asha R.", attachments: [{ id: 31, fileName: "Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: "/api/documents/31" }] });
    expect(screen.getByText("Asha R. is requesting your referral")).toBeTruthy();
    expect(screen.getByText("Viewing Resume.pdf")).toBeTruthy();
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe("/api/documents/31");
    expect(screen.getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/documents/31");
    expect(screen.queryByText(ACCESS_ENDED)).toBeNull();
  });

  it("no files keeps the required-document state", () => {
    renderReview({ ...base, attachments: [] });
    expect(screen.getByText("0 attached")).toBeTruthy();
    expect(screen.getByText("A document is required before this request can be submitted.")).toBeTruthy();
  });
});
