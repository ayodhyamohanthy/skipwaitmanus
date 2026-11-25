// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import NotFound from "./NotFound";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(async () => { await import("./goal/system/GoalNotFound"); });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Not found recovery", () => {
  it("identifies the missing page and offers only local recovery destinations", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<NotFound />);

    expect(await screen.findByRole("heading", { name: "This page isn't here." })).toBeTruthy();
    expect(await screen.findByText("404")).toBeTruthy();
    expect(screen.getByText("The page may have moved, or the link was mistyped.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
