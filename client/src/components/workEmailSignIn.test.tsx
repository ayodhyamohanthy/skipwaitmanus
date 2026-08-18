// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkEmailSignIn } from "./WorkEmailSignIn";

const clerk = vi.hoisted(() => ({
  signIn: { create: vi.fn(), prepareFirstFactor: vi.fn(), attemptFirstFactor: vi.fn() },
  signUp: { create: vi.fn(), prepareEmailAddressVerification: vi.fn(), attemptEmailAddressVerification: vi.fn() },
  setActive: vi.fn(),
}));

vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: clerk.signIn, setActive: clerk.setActive }),
  useSignUp: () => ({ isLoaded: true, signUp: clerk.signUp, setActive: clerk.setActive }),
}));

describe("WorkEmailSignIn", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.values(clerk.signIn).forEach(mock => mock.mockReset());
    Object.values(clerk.signUp).forEach(mock => mock.mockReset());
    clerk.setActive.mockReset();
  });
  afterEach(() => cleanup());

  it("prepares an OTP only for the entered company-email factor using a provider-valid request", async () => {
    clerk.signIn.create.mockResolvedValue({ status: "needs_first_factor", supportedFirstFactors: [
      { strategy: "email_code", emailAddressId: "personal-id", safeIdentifier: "personal@gmail.com" },
      { strategy: "email_code", emailAddressId: "work-id", safeIdentifier: "employee@acme.com" },
    ] });
    render(<WorkEmailSignIn />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(clerk.signIn.create).toHaveBeenCalledWith({ identifier: "employee@acme.com", strategy: "email_code" }));
    await waitFor(() => expect(clerk.signIn.prepareFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "work-id" }));
    expect(clerk.signIn.prepareFirstFactor).not.toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "personal-id" });
    expect(screen.getByText("Code sent to employee@acme.com")).toBeTruthy();
  });

  it("turns an existing-email sign-up collision into a provider-valid company-email sign-in without showing an email-taken message", async () => {
    clerk.signIn.create
      .mockRejectedValueOnce({ errors: [{ code: "form_identifier_not_found" }] })
      .mockResolvedValueOnce({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "work-id", safeIdentifier: "employee@acme.com" }] });
    clerk.signUp.create.mockRejectedValue({ errors: [{ code: "form_identifier_exists", longMessage: "That email address is taken. Please try another." }] });
    render(<WorkEmailSignIn />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(clerk.signIn.create).toHaveBeenLastCalledWith({ identifier: "employee@acme.com", strategy: "email_code" }));
    await waitFor(() => expect(clerk.signIn.prepareFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "work-id" }));
    expect(screen.queryByText(/That email address is taken/i)).toBeNull();
    expect(screen.getByText("Code sent to employee@acme.com")).toBeTruthy();
  });
});
