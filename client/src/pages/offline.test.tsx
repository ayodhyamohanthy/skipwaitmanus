// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Offline from "./Offline";

describe("Offline screen (kit v4)", () => {
  it("shows the saved-info banner, headline, draft reassurance, and Try again", () => {
    render(<Offline />);
    expect(screen.getByText("You're offline. Showing saved info.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No connection." })).toBeTruthy();
    expect(screen.getByText(/Your drafts are saved on this device/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" }).className).toContain("brand-button");
  });
});
