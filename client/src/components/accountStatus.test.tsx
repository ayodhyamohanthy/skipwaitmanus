// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountStatus } from "./AccountStatus";

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, signOut }),
  useUser: () => ({ isLoaded: true, user: { firstName: "Ayodhya" } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

describe("AccountStatus", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); });
  it("shows the signed-in identity and allows the user to sign out", () => {
    render(<AccountStatus />);
    expect(screen.getByText("Ayodhya")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
