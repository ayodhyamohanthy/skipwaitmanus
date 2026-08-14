// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

vi.mock("@/lib/pwaContinuity", () => ({ requestSavedDeviceCredential: vi.fn(), supportsBrowserCredentialMediation: () => false }));

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps a concise public path to browse shared opportunities alongside the core role choices", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /Browse shared opportunities/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Browse opportunities/i })).toBeTruthy();
  });
});
