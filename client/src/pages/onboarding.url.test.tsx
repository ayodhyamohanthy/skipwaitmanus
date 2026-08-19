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
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(document.querySelector("[data-skipwait-logo-mark='true']")).toBeNull();
    expect(screen.queryByText("skipwait.me")).toBeNull();
    const input = screen.getByLabelText("Target Role URL");
    const continueButton = screen.getByRole("button", { name: "Continue" });

    fireEvent.change(input, { target: { value: "product designer at Example" } });
    expect(screen.getByRole("alert").textContent).toMatch(/complete job link/i);
    expect(continueButton).toHaveProperty("disabled", true);
    expect(screen.getByText("Fix the link above to continue")).toBeTruthy();
    expect(continueButton.getAttribute("aria-describedby")).toBe("continue-hint");

    fireEvent.change(input, { target: { value: "https://careers.example.com/jobs/product-designer" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(continueButton).toHaveProperty("disabled", false);
    expect(screen.queryByText("Fix the link above to continue")).toBeNull();
  });

  it("restores the included balance when a legacy reset marker exists without a stored token balance", () => {
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://careers.example.com/jobs/product-designer" } });
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });

  it("allows URL progression even when the current local credit balance is explicitly zero", () => {
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    localStorage.setItem("bridge-tokens", "0");
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://careers.example.com/jobs/product-designer" } });
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });

  it("confirms the reviewed employer for the reported Wellfound listing before the user continues", () => {
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile" } });
    expect(screen.getByRole("status").textContent).toContain("Company identified: ChatFin");
    expect(document.querySelector("[data-reviewed-employer='true']")).toBeTruthy();
  });
});
