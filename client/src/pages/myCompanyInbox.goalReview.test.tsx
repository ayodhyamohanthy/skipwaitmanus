// @vitest-environment jsdom
// Goal review regressions for the company inbox. These tests render the real page
// and only replace auth, shell-adjacent integrations, and the HTTP boundary.
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyCompanyInbox from "./MyCompanyInbox";
import { PASS_REASON_OPTIONS } from "@shared/passReasons";

const { go, getToken, authState } = vi.hoisted(() => ({
  authState: { signedIn: true },
  go: vi.fn(),
  getToken: vi.fn().mockResolvedValue("quillmint-test-token"),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken }),
  useUser: () => ({
    user: {
      emailAddresses: [
        {
          emailAddress: "reviewer@quillmint.example",
          verification: { status: "verified" },
        },
      ],
    },
  }),
}));
vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ["/queue", go],
  useSearch: () => "",
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({
    status: "verified",
    access: {
      verified: true,
      domain: "quillmint.example",
      companyName: "Quillmint",
      companyInitials: "Q",
    },
  }),
}));
vi.mock("@/components/AccountMenu", () => ({
  AccountMenu: () => <div>Account</div>,
}));
vi.mock("@/components/Brand", () => ({
  Brand: () => <div>skipwait.me</div>,
  LogoMark: () => <div data-skipwait-logo-mark="true" />,
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const baseItem = {
  id: 41,
  targetRoleUrl: "https://jobs.quillmint.example/product-designer",
  companyDomain: "quillmint.example",
  companyName: "Quillmint",
  status: "pending",
  createdAt: new Date().toISOString(),
  attachmentCount: 1,
  isClaimedByYou: false,
  publicRef: "R-QM41",
  jobTitle: "Product Designer",
};
const secondItem = {
  ...baseItem,
  id: 42,
  publicRef: "R-QM42",
  jobTitle: "Senior Product Designer",
};
const preview = {
  id: 41,
  candidateName: "PRIVATE SEEKER NAME",
  candidateMessage:
    "I led Quillmint-scale product launches. I build clear systems with measurable outcomes.",
  targetRoleUrl: baseItem.targetRoleUrl,
  attachments: [{ id: 1, fileName: "portfolio.pdf" }],
  publicRef: "R-QM41",
};

function response(payload: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => payload };
}

function stubFetch(
  options: {
    requests?: (typeof baseItem)[];
    preview?: unknown;
    review?: unknown;
    reviewPromise?: Promise<unknown>;
    previewAttempts?: { first: unknown; next: unknown };
    holdInboxRefreshAfterReview?: boolean;
  } = {}
) {
  const requests = options.requests ?? [baseItem];
  let previewAttempt = 0;
  let reviewSettled = false;
  const heldRefresh = options.holdInboxRefreshAfterReview
    ? new Promise<void>(() => {})
    : null;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/one-click-review") && init?.method === "POST") {
      if (options.reviewPromise) return options.reviewPromise;
      if (
        options.review &&
        typeof options.review === "object" &&
        "__error" in options.review
      ) {
        return response(
          { error: (options.review as { __error: string }).__error },
          false
        );
      }
      reviewSettled = true;
      return response(options.review ?? { status: "approved" });
    }
    if (url.includes("/preview")) {
      if (options.previewAttempts) {
        previewAttempt += 1;
        const value =
          previewAttempt === 1
            ? options.previewAttempts.first
            : options.previewAttempts.next;
        if (value && typeof value === "object" && "__error" in value)
          return response(
            { error: (value as { __error: string }).__error },
            false
          );
        return response(value);
      }
      return response(options.preview ?? { request: preview });
    }
    if (url.includes("/inbox?scope=new")) {
      if (heldRefresh && reviewSettled) await heldRefresh;
      return response({ requests });
    }
    if (url.includes("/inbox?scope=saved")) return response({ requests: [] });
    if (url.includes("/api/referrer/home"))
      return response({ home: { routing: { state: "active" } } });
    if (url.includes("/api/referrer-preferences"))
      return response({ preferences: { notifyNewAsk: false } });
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Queue() {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MyCompanyInbox />
    </QueryClientProvider>
  );
}

async function openFirstAsk(waitForPreview = true) {
  render(<Queue />);
  const asks = await screen.findAllByRole("button", {
    name: /Product Designer/,
  });
  fireEvent.click(asks[0]);
  const accept = await screen.findByRole("button", { name: /Accept & connect/ });
  if (waitForPreview) await waitFor(() => expect(accept.getAttribute("aria-disabled")).not.toBe("true"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  authState.signedIn = true;
});

describe("Quillmint company inbox goal review", () => {
  it("shows the goal heading and contextual Your next step block once requests load", async () => {
    stubFetch();
    render(<Queue />);

    expect(
      await screen.findByRole("heading", {
        name: "Help the right person get referred.",
      })
    ).toBeTruthy();
    expect(await screen.findByText("Your next step")).toBeTruthy();
    expect(screen.getAllByText(/Quillmint/).length).toBeGreaterThan(0);
  });

  it("allows exactly one primary Accept commit for the selected ask", async () => {
    let resolveReview!: (value: unknown) => void;
    const reviewPromise = new Promise(resolve => {
      resolveReview = resolve;
    });
    const fetchMock = stubFetch({ reviewPromise });
    await openFirstAsk();

    const accept = screen.getByRole("button", { name: /Accept & connect/ });
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(document.querySelectorAll("#ask-role")).toHaveLength(1);
    fireEvent.click(accept);
    fireEvent.click(accept);
    await waitFor(() => expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/one-click-review") && init?.method === "POST"
      )
    ).toHaveLength(1));
    expect(accept.getAttribute("aria-disabled")).toBe("true");

    resolveReview({ status: "approved" });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("/one-click-review")
        ).length
      ).toBe(1)
    );
  });

  it("does not let j or k change the selected ask while the pass sheet is open", async () => {
    stubFetch({ requests: [baseItem, secondItem] });
    await openFirstAsk();
    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    expect(screen.getByTestId("goal-sheet")).toBeTruthy();

    fireEvent.keyDown(window, { key: "j" });
    expect(document.getElementById("ask-role")?.textContent).toBe("Product Designer");
    fireEvent.keyDown(window, { key: "k" });
    expect(
      screen.getByRole("heading", { name: "Product Designer", hidden: true })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Senior Product Designer", hidden: true })
    ).toBeNull();
  });

  it("does not reopen the pass sheet with p while review mutation is pending", async () => {
    let resolveReview!: (value: unknown) => void;
    const reviewPromise = new Promise(resolve => {
      resolveReview = resolve;
    });
    const fetchMock = stubFetch({ reviewPromise });
    await openFirstAsk();

    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));
    expect(screen.queryByTestId("goal-sheet")).toBeNull();
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.queryByTestId("goal-sheet")).toBeNull();
    await waitFor(() => expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/one-click-review")
      )
    ).toHaveLength(1));

    resolveReview({ status: "approved" });
  });

  it("announces a one-click-review error in the selected detail, not only in the hidden mobile list", async () => {
    stubFetch({
      review: { __error: "Quillmint review service is unavailable" },
    });
    await openFirstAsk();
    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));

    const detail = screen.getByRole("region", { name: "Ask detail" });
    await waitFor(() =>
      expect(within(detail).getByRole("alert").textContent).toContain(
        "Quillmint review service is unavailable"
      )
    );
    expect(
      within(
        screen.getByRole("region", { name: "Referral queue" })
      ).queryByRole("alert")
    ).toBeNull();
  });

  it("routes signed-out referrers to sign-in without requesting a private inbox", async () => {
    authState.signedIn = false;
    const fetchMock = stubFetch();
    render(<Queue />);
    fireEvent.click(await screen.findByRole("button", { name: "Use company email" }));
    expect(go).toHaveBeenCalledWith("/sign-in");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("company-referrals"))).toBe(false);
  });

  it("hands a successful acceptance directly to its private conversation", async () => {
    stubFetch();
    await openFirstAsk();
    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/conversation/41?from=inbox"));
  });

  it("hands a successful acceptance to its private conversation even while the inbox refresh is still pending", async () => {
    const fetchMock = stubFetch({ holdInboxRefreshAfterReview: true });
    await openFirstAsk();
    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));

    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("/conversation/41?from=inbox")
    );
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/inbox?scope=new")
      )
    ).toHaveLength(2);
  });

  it.each(PASS_REASON_OPTIONS)("posts pass code $code without an acceptance attestation or credit request", async option => {
    const fetchMock = stubFetch();
    await openFirstAsk();
    expect(document.body.textContent).not.toContain("PRIVATE SEEKER NAME");
    expect(document.body.textContent).not.toContain("portfolio.pdf");
    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(option.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/41/one-click-review", expect.objectContaining({
      method: "POST", body: JSON.stringify({ decision: "declined", declineReason: option.legacy, passReason: option.code }),
    })));
    const decision = fetchMock.mock.calls.find(([url]) => String(url).includes("/one-click-review"));
    expect(JSON.parse(String(decision?.[1]?.body))).not.toHaveProperty("ethicsConfirmed");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/credits/"))).toBe(false);
  });

  it("offers an explicit retry after a failed preview instead of a blank Why me section", async () => {
    stubFetch({
      previewAttempts: {
        first: { __error: "Preview temporarily unavailable" },
        next: { request: preview },
      },
    });
    await openFirstAsk(false);

    expect(
      await screen.findByRole("button", { name: "Try preview again" })
    ).toBeTruthy();
    expect(screen.queryByText("Why me")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try preview again" }));
    await waitFor(() => expect(screen.getByText("Why me")).toBeTruthy());
    expect(screen.getByText(/Quillmint-scale product launches/)).toBeTruthy();
  });
});
