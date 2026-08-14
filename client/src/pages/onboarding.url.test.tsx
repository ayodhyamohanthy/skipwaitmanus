// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Onboarding from "./Onboarding";

vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));

describe("Onboarding Target Role URL", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("blocks arbitrary text and enables continue only for a complete HTTP(S) job link", () => {
    render(<Onboarding />);
    const input = screen.getByLabelText("Target Role URL");
    const continueButton = screen.getByRole("button", { name: "Continue" });

    fireEvent.change(input, { target: { value: "product designer at Example" } });
    expect(screen.getByRole("alert").textContent).toMatch(/complete job link/i);
    expect(continueButton).toHaveProperty("disabled", true);

    fireEvent.change(input, { target: { value: "https://careers.example.com/jobs/product-designer" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(continueButton).toHaveProperty("disabled", false);
  });
});
