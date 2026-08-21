// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailReviewAction from "./EmailReviewAction";

const { authState, go } = vi.hoisted(() => ({ authState: { signedIn: true }, go: vi.fn() }));

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-token") }) }));
vi.mock("wouter", () => ({ useRoute: () => [true, { linkToken: "a".repeat(48) }], useLocation: () => ["/email-review", go] }));
vi.mock("@/components/WorkEmailSignIn", () => ({ WorkEmailSignIn: () => <div>Work email sign in</div> }));

describe("EmailReviewAction", () => {
  beforeEach(() => { authState.signedIn = true; window.history.replaceState({}, "", "/email-review/" + "a".repeat(48) + "?decision=approved"); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); });

  it("submits an approved decision through the opaque authenticated review link and shows no candidate details", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "approved" }) })); vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    await waitFor(() => expect(screen.getByText("Referral accepted.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(`/api/referrer-review-links/${"a".repeat(48)}/decision`, expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved" }) }));
    expect(document.body.textContent).not.toMatch(/candidate|resume|document|queue/i);
  });
});
