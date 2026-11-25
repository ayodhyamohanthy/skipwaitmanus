import { describe, expect, it } from "vitest";
import { plainTextSnippet } from "./plainText";

// Live on skipwait.me (Nov 25): Greenhouse's ?content=true returns entity-encoded HTML, and the old helper stripped
// tags before decoding, so "&lt;h2&gt;Who we are&lt;/h2&gt;" reached the jobs list as literal "<h2>Who we are</h2>".
describe("plainTextSnippet", () => {
  it("turns Greenhouse's entity-encoded HTML into plain text", () => {
    expect(plainTextSnippet("&lt;h2&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/h2&gt; &lt;p&gt;Stripe is a financial infrastructure platform.&lt;/p&gt;"))
      .toBe("Who we are Stripe is a financial infrastructure platform.");
  });

  it("strips ordinary HTML and decodes named and numeric entities once", () => {
    expect(plainTextSnippet("<p>Build <b>payments</b> &amp; billing&nbsp;&#8212; R&amp;D &#x2019;26</p>")).toBe("Build payments & billing — R&D ’26");
    expect(plainTextSnippet("Use &amp;lt;b&amp;gt; for bold")).toBe("Use &lt;b&gt; for bold");
    expect(plainTextSnippet("<p>Build <b>payments</b>.</p><p>Ship <a href='x'>fast</a>.</p>")).toBe("Build payments. Ship fast.");
  });

  it("drops script and style content, collapses whitespace and caps the length", () => {
    expect(plainTextSnippet("<style>p{color:red}</style><p>Hello</p><script>alert(1)</script>\n\n  world")).toBe("Hello world");
    expect(plainTextSnippet(`<p>${"word ".repeat(200)}</p>`, 400)).toHaveLength(400);
  });

  it("answers an empty string for nothing", () => {
    expect(plainTextSnippet("")).toBe("");
    expect(plainTextSnippet(undefined)).toBe("");
  });
});
