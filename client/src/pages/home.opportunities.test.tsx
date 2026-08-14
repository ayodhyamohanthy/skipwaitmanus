// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps a concise public path to browse shared opportunities alongside the core role choices", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /^Internal Openings$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Internal openings$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign in/i })).toBeNull();
    expect(screen.queryByText(/Use saved device sign-in/i)).toBeNull();
  });
});
