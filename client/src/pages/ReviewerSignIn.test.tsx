// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewerSignIn from "./ReviewerSignIn";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.head.querySelectorAll('meta[name="robots"]').forEach(n => n.remove()); });

describe("ReviewerSignIn", () => {
  it("is noindex and shows the server error without revealing which field was wrong", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Email or password is not right." }), { status: 401 })));
    render(<ReviewerSignIn />);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "seeker@reviewer.skipwait.me" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Email or password is not right."));
    expect(fetch).toHaveBeenCalledWith("/api/auth/reviewer/sign-in", expect.objectContaining({ method: "POST" }));
  });
});
