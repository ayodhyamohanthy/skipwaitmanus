// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Home from "./Home";
import { publicRoute } from "@shared/publicRoutes";
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: () => false }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
describe("landing metadata survives Home mounting", () => {
 afterEach(() => { cleanup(); document.head.innerHTML = ""; });
 for (const signedIn of [false, true]) {
  it(`keeps registry descriptions after mount (signedIn=${signedIn})`, () => {
   auth.isSignedIn = signedIn;
   const description = publicRoute("/")!.description;
   document.head.innerHTML = `<meta name="description" content="${description}"><meta property="og:description" content="${description}"><meta name="twitter:description" content="${description}">`;
   render(<Home />);
   for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    expect(document.head.querySelector(selector)?.getAttribute("content"), selector).toBe(description);
   }
  });
 }
});
