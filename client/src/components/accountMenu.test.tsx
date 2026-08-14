// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut }) }));

describe("AccountMenu", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); });

  it("keeps account identity hidden and exposes sign out from the user-icon dropdown", async () => {
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
