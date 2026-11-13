// @vitest-environment jsdom
// SUPPORT-A (docs/plans/SUPPORT-A.md §7): the kit /support page promises only
// what works today. Block 1 pins the DO-NOT-TOUCH legal identity, mailto and
// footer bytes; Block 2 is the red-first R1-R5 contract that fails on main's
// file and passes only after the five unsupported promises are removed.
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import Support from "./Support";

const supportSource = () => readFileSync(resolve(process.cwd(), "client/src/pages/Support.tsx"), "utf8");
const shellSource = () => readFileSync(resolve(process.cwd(), "client/src/components/PolicyPageShell.tsx"), "utf8");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

// P1-P5: the whole legal identity line, byte-exact.
const P5 = '          <p className="mt-3 text-xs leading-5 text-[#505050]">Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me), D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India · <a href="tel:+919513064808" className="font-semibold text-black">+91 95130 64808</a> (Mon–Fri, IST business hours).</p>';
// P6: the existing mailto constant (literal backslash-n sequences, not newlines).
const P6 = 'const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("skipwait.me support request")}&body=${encodeURIComponent("Account email:\\nWhat happened:\\nReference (Ref-, payment id, or link), if any:\\n")}`;';
// P7: the mailto anchor.
const P7 = '          <a href={mailto} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3 text-sm font-bold text-white hover:bg-[#0000cc] sm:w-auto">Email {SUPPORT_EMAIL} <ArrowRight className="h-4 w-4" /></a>';
// P8: the import the mailto depends on.
const P8 = 'import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";';
// P9: the support email value, asserted only (PolicyPageShell.tsx is not owned).
const P9 = 'export const SUPPORT_EMAIL = "support@skipwait.me";';

vi.mock("@/lib/goalSurfaces", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/goalSurfaces")>()), goalSurfaceOn: () => false }));

function renderSupport() {
  // jsdom has a window, so wouter reads the browser location, not ssrPath.
  window.history.replaceState({}, "", "/support");
  return render(<Router ssrPath="/support"><Support /></Router>);
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SUPPORT-A block 1 — DO NOT TOUCH (passes on main and after R1-R5)", () => {
  it("S1: the whole legal identity line occurs exactly once in the source", () => {
    expect(occurrences(supportSource(), P5)).toBe(1);
  });

  it("S2: the mailto constant occurs exactly once in the source", () => {
    expect(occurrences(supportSource(), P6)).toBe(1);
  });

  it("S3: the mailto anchor occurs exactly once in the source", () => {
    expect(occurrences(supportSource(), P7)).toBe(1);
  });

  it("S4: the SUPPORT_EMAIL import and its value each occur exactly once", () => {
    expect(occurrences(supportSource(), P8)).toBe(1);
    expect(occurrences(shellSource(), P9)).toBe(1);
  });

  it("D1: the rendered legal identity line keeps its exact text and classes", () => {
    const { container } = renderSupport();
    const phone = container.querySelector('section[aria-label="Contact support"] a[href="tel:+919513064808"]');
    expect(phone).not.toBeNull();
    const line = phone!.closest("p")!;
    expect(line.textContent).toBe("Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me), D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India · +91 95130 64808 (Mon–Fri, IST business hours).");
    expect(line.getAttribute("class")).toBe("mt-3 text-xs leading-5 text-[#505050]");
  });

  it("D2: the phone link keeps its exact href, text and classes", () => {
    const { container } = renderSupport();
    const phones = Array.from(container.querySelectorAll('a[href^="tel:"]'));
    expect(phones).toHaveLength(1);
    expect(phones[0].getAttribute("href")).toBe("tel:+919513064808");
    expect(phones[0].textContent).toBe("+91 95130 64808");
    expect(phones[0].getAttribute("class")).toBe("font-semibold text-black");
  });

  it("D3: proprietor, address and business hours each appear once in the rendered page", () => {
    const { container } = renderSupport();
    const text = container.textContent ?? "";
    expect(occurrences(text, "Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me)")).toBe(1);
    expect(occurrences(text, "D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India")).toBe(1);
    expect(occurrences(text, "(Mon–Fri, IST business hours).")).toBe(1);
  });

  it("D4: the single mailto keeps its exact href and visible address", () => {
    const { container } = renderSupport();
    const mailtos = Array.from(container.querySelectorAll('a[href^="mailto:"]'));
    expect(mailtos).toHaveLength(1);
    expect(mailtos[0].closest('section[aria-label="Contact support"]')).not.toBeNull();
    expect(mailtos[0].getAttribute("href")).toBe("mailto:support@skipwait.me?subject=skipwait.me%20support%20request&body=Account%20email%3A%0AWhat%20happened%3A%0AReference%20(Ref-%2C%20payment%20id%2C%20or%20link)%2C%20if%20any%3A%0A");
    expect(mailtos[0].textContent).toBe("Email support@skipwait.me ");
  });
});

describe("SUPPORT-A block 2 — red-first R1-R5 (fails on main, passes after the replacements)", () => {
  it("R1: the one h1 states the actual action, not a person or a response time", () => {
    const { container } = renderSupport();
    const headings = Array.from(container.querySelectorAll("h1"));
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Contact support.");
  });

  it("R1-R5: no unbacked person, response-time, triage, pause or notification promise remains", () => {
    const { container } = renderSupport();
    const text = container.textContent ?? "";
    for (const phrase of [
      "A person answers",
      "within one business day",
      "reaches an administrator directly",
      "Response target",
      "handled first",
      "triaged ahead of everything else",
      "can be paused while we look",
      "in-product notification when an administrator decides",
    ]) {
      expect(text.includes(phrase), `unsupported promise still rendered: ${phrase}`).toBe(false);
    }
  });

  it("R1-R5: the source itself carries none of the removed phrases", () => {
    const source = supportSource();
    for (const phrase of [
      "A person answers",
      "within one business day",
      "reaches an administrator directly",
      "Response target",
      "handled first",
      "triaged ahead of everything else",
      "can be paused while we look",
      "in-product notification when an administrator decides",
    ]) {
      expect(source.includes(phrase), `unsupported promise still in source: ${phrase}`).toBe(false);
    }
  });
});
