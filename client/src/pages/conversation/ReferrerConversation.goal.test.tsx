// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReferrerConversation } from "./ReferrerConversation";
vi.mock("@/components/goal", async () => ({
  ...(await vi.importActual<any>("@/components/goal")),
  GoalAppShell: ({ children }: any) => <div>{children}</div>,
}));
afterEach(cleanup);
const request = {
  id: 1,
  title: "Designer",
  companyDomain: "acme.com",
  status: "approved",
  referrerId: 3,
  candidateName: "Asha R.",
  pitch: "A clear ask",
  attachments: [],
  attachmentCount: 0,
} as any;
const props = {
  request,
  role: "referrer-claimed" as const,
  passed: false,
  referrerLabel: "You",
  messages: [],
  draft: "",
  setDraft: vi.fn(),
  sending: false,
  messageError: "",
  referenceId: null,
  failure: "",
  loading: false,
  onReload: vi.fn(),
  onSend: vi.fn(),
  onAccept: vi.fn(),
  onPass: vi.fn(),
  onMarkReferred: vi.fn(),
  onExtendReferredDeadline: vi.fn(),
  onStepBack: vi.fn(),
};
it("leads accepted referrers to the referral before messages, with one black commit", () => {
  const { container } = render(<ReferrerConversation {...props} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Help this ask become a referral."
  );
  expect(screen.getByRole("region", { name: "Your next step" })).toBeTruthy();
  expect(container.querySelectorAll('[data-g-primary="true"]')).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Send" }).getAttribute("data-g-primary")
  ).toBeNull();
});
it("locks identity, files and messaging until this referrer's acceptance", () => {
  render(
    <ReferrerConversation
      {...props}
      role="referrer-pending"
      request={{
        ...request,
        status: "pending",
        candidateName: "SHOULD NOT SHOW",
        attachments: [{ id: 2, fileName: "secret.pdf", url: "/secret" }],
      }}
    />
  );
  expect(screen.queryByText("SHOULD NOT SHOW")).toBeNull();
  expect(screen.queryByText("secret.pdf")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));
  expect(
    (screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
it("keeps the accept mutation behind an explicit ethics confirmation and one commit", () => {
 const {container}=render(<ReferrerConversation {...props} role="referrer-pending" request={{...request,status:"pending"}}/>);
 fireEvent.click(screen.getByRole("button",{name:/Accept & connect/}));
 expect(container.querySelectorAll('[data-g-primary="true"]')).toHaveLength(0);
 const accept=screen.getByRole("button",{name:"Accept"});
 fireEvent.click(accept);expect(props.onAccept).not.toHaveBeenCalled();
 fireEvent.click(screen.getByLabelText(/I'll refer only through/));
 fireEvent.click(accept);expect(props.onAccept).toHaveBeenCalledTimes(1);
});
