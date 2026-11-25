// @vitest-environment jsdom
// Released policy routes preserve every supplied legal prop on the goal frame.
// The expected body comes from the page props, not another render of the goal
// component. Legal page files and the guide catalog remain the copy authority.
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { GUIDES, relatedGuides } from "@/content/guides";
import { PolicyPageShell, SUPPORT_EMAIL } from "@/components/PolicyPageShell";
import Terms from "@/pages/Terms";
import TrustPrivacy from "@/pages/TrustPrivacy";
import RefundPolicy from "@/pages/RefundPolicy";
import CancellationPolicy from "@/pages/CancellationPolicy";
import ShippingPolicy from "@/pages/ShippingPolicy";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Guidelines from "@/pages/Guidelines";
import Support from "@/pages/Support";
import GuidePage from "@/pages/GuidePage";

type PolicyProps = Parameters<typeof PolicyPageShell>[0];
const supplied = vi.hoisted((): { props: PolicyProps | null } => ({ props: null }));
vi.mock("@/components/PolicyPageShell", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/PolicyPageShell")>();
  return { ...actual, PolicyPageShell: (props: PolicyProps) => {
    supplied.props = props;
    return <actual.PolicyPageShell {...props} />;
  } };
});

const POLICY_PAGES: ReadonlyArray<{ route: string; Page: () => React.ReactElement | null; goalLine: string }> = [
  { route: "/terms", Page: Terms, goalLine: "Know your rights." },
  { route: "/privacy", Page: TrustPrivacy, goalLine: "Know your rights." },
  { route: "/refunds", Page: RefundPolicy, goalLine: "Know your rights." },
  { route: "/cancellations", Page: CancellationPolicy, goalLine: "Know your rights." },
  { route: "/shipping", Page: ShippingPolicy, goalLine: "Know your rights." },
  { route: "/guidelines", Page: Guidelines, goalLine: "Know your rights." },
  { route: "/about", Page: About, goalLine: "Know who runs skipwait.me." },
  { route: "/contact", Page: Contact, goalLine: "Talk to a human." },
];

function renderAt(route: string, Page: () => React.ReactElement | null) {
  // jsdom has a window, so wouter reads the browser location, not ssrPath.
  window.history.replaceState({}, "", route);
  return render(<Router ssrPath={route}><Page /></Router>);
}

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const legalBody = (container: HTMLElement) => norm(container.querySelector("article")?.textContent);
const shortVersion = (container: HTMLElement) => Array.from(container.querySelectorAll("#policy-summary ~ ul li")).map(li => norm(li.textContent).replace(/^•\s*/, ""));
const guideBody = (container: HTMLElement) => Array.from(container.querySelectorAll("main section")).map(section => norm(section.textContent)).join(" | ");

function renderLegalReference(props: PolicyProps) {
  return render(<article>
    {props.intro ? <p>{props.intro}</p> : null}
    {props.children}
    {props.footnote ? <p>{props.footnote}</p> : null}
    {props.sections ? <p>Questions? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p> : null}
  </article>);
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  supplied.props = null;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("policy pages on the goal frame (D-048-p3-policy)", () => {
  for (const { route, Page, goalLine } of POLICY_PAGES) {
    it(`${route}: every legal prop is preserved in the default fetch-free goal frame`, () => {
      const page = renderAt(route, Page);
      const frame = page.container.querySelector("[data-testid=goal-policy]");
      expect(frame).not.toBeNull();
      const body = legalBody(page.container);
      const summary = shortVersion(page.container);
      expect(body.length).toBeGreaterThan(100);
      expect(page.container.querySelectorAll("h1")).toHaveLength(1);
      expect(norm(page.container.querySelector("h1")?.textContent)).toBe(goalLine);
      // Guidelines has no public-route breadcrumb in either existing frame.
      expect(page.container.querySelector('nav[aria-label="Breadcrumb"]') !== null).toBe(route !== "/guidelines");
      const props = supplied.props;
      expect(props).not.toBeNull();
      if (!props) throw new Error("The page must supply its legal content to the shell");
      expect(summary).toEqual((props.summary ?? []).map(item => norm(item)));
      cleanup();
      const reference = renderLegalReference(props);
      expect(body).toBe(legalBody(reference.container));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("keeps non-policy /pricing and /support callers on their existing frame", () => {
    const pricing = render(<Router ssrPath="/pricing"><PolicyPageShell screen="pricing" eyebrow="Pricing" title="Pricing." updated="Oct 1, 2026"><p>Plans.</p></PolicyPageShell></Router>);
    expect(pricing.container.querySelector("[data-testid=goal-policy]")).toBeNull();
    cleanup();
    const support = renderAt("/support", Support);
    expect(support.container.querySelector("[data-testid=goal-policy]")).toBeNull();
  });
});

describe("guides on the goal frame (D-048-p3-policy)", () => {
  for (const guide of GUIDES) {
    it(`${guide.route}: every catalog section and answer stays in the default fetch-free goal frame`, () => {
      const page = renderAt(guide.route, GuidePage);
      expect(page.container.querySelector("[data-testid=goal-policy]")).not.toBeNull();
      const body = guideBody(page.container);
      const sections = guide.sections.map(section => norm(section.heading + section.paragraphs.join("") + (section.points ?? []).join("")));
      const questions = norm("Questions people ask" + guide.faq.map(entry => entry.question + entry.answer).join(""));
      expect(body.length).toBeGreaterThan(200);
      expect(body).toBe([...sections, questions].join(" | "));
      expect(page.container.querySelectorAll("h1")).toHaveLength(1);
      for (const entry of guide.faq) expect(page.container.textContent).toContain(entry.question);
      expect(page.container.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
      expect(Array.from(page.container.querySelectorAll('nav[aria-label="Other guides"] a')).map(link => link.getAttribute("href"))).toEqual(relatedGuides(guide).map(sibling => sibling.route));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
