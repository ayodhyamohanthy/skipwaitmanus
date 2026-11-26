// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Home from "./Home";
import { publicRoute } from "@shared/publicRoutes";

const { auth, navigate } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  navigate: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "checking" }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", navigate],
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));

describe("landing metadata survives Home mounting", () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    navigate.mockReset();
    vi.unstubAllGlobals();
  });

  for (const signedIn of [false, true]) {
    it(`keeps registry descriptions after mount (signedIn=${signedIn})`, () => {
      auth.isSignedIn = signedIn;
      const homeRoute = publicRoute("/");
      if (!homeRoute) throw new Error("Home is missing from the public route registry");
      const description = homeRoute.description;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      document.head.innerHTML = `<meta name="description" content="${description}"><meta property="og:description" content="${description}"><meta name="twitter:description" content="${description}">`;
      render(<Home />);
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        expect(document.head.querySelector(selector)?.getAttribute("content"), selector).toBe(description);
      }
      expect(navigate).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});
