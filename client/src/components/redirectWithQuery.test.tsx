// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Route, Switch } from "wouter";
import { RedirectWithQuery } from "./RedirectWithQuery";

function App() {
  return <Switch><Route path="/request"><RedirectWithQuery to="/ask" /></Route><Route path="/ask"><p>Ask composer</p></Route></Switch>;
}

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("RedirectWithQuery", () => {
  it("keeps a personal referrer link and the hash through /request -> /ask", async () => {
    window.history.replaceState(null, "", "/request?fast=abcdefghijklmnop1234&utm_source=bio#compose");
    const depth = window.history.length;
    render(<App />);
    expect(await screen.findByText("Ask composer")).toBeTruthy();
    expect(window.location.pathname).toBe("/ask");
    expect(window.location.search).toBe("?fast=abcdefghijklmnop1234&utm_source=bio");
    expect(window.location.hash).toBe("#compose");
    expect(window.history.length).toBe(depth);
  });

  it("keeps a vanity alias", async () => {
    window.history.replaceState(null, "", "/request?referCompany=tcs&referAlias=asha-k");
    render(<App />);
    expect(await screen.findByText("Ask composer")).toBeTruthy();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/ask?referCompany=tcs&referAlias=asha-k");
  });

  it("redirects a bare alias without adding an empty query", async () => {
    window.history.replaceState(null, "", "/request");
    render(<App />);
    expect(await screen.findByText("Ask composer")).toBeTruthy();
    expect(window.location.href).toBe(`${window.location.origin}/ask`);
  });
});
