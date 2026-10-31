import { afterEach, describe, expect, it, vi } from "vitest";
import * as deps from "./skippieSeekerDeps";
import type { fetchPublicJobLink } from "./jobLinkPreview";

vi.mock("./db", () => ({}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

type SafeReader = typeof fetchPublicJobLink;
const readJob = (deps as unknown as {
  fetchJobText: (url: string, reader?: SafeReader) => Promise<string | null>;
}).fetchJobText;
const description = "Build reliable public referral tools with clear ownership and good tests. ".repeat(3);

afterEach(() => vi.unstubAllGlobals());

describe("Skippy job text uses the bounded public fetcher", () => {
  it("uses the safe-reader result, strips markup, and never calls global fetch", async () => {
    const unsafeFetch = vi.fn(() => { throw Error("global fetch must not run"); });
    vi.stubGlobal("fetch", unsafeFetch);
    const safeReader = vi.fn<SafeReader>().mockResolvedValue({
      canonicalUrl: "https://careers.example.test/final",
      body: `<script>private script</script><style>hidden</style><p>${description}</p>`,
    });
    const result = await readJob("https://careers.example.test/job", safeReader);
    expect(safeReader).toHaveBeenCalledExactlyOnceWith("https://careers.example.test/job");
    expect(result).toBe(description.trim());
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["http://localhost:3000/", "unsafe_destination"],
    ["http://[::1]/", "unsafe_destination"],
    ["http://169.254.169.254/", "unsafe_destination"],
    ["https://careers.example.test/redirect-private", "unsafe_destination"],
    ["https://careers.example.test/redirect-loop", "redirect_limit"],
    ["https://careers.example.test/blocked-board", "hosted_redirect_blocked"],
  ])("returns no text when the safe reader rejects %s", async (url, reason) => {
    const unsafeFetch = vi.fn(() => { throw Error("global fetch must not run"); });
    vi.stubGlobal("fetch", unsafeFetch);
    const safeReader = vi.fn<SafeReader>().mockRejectedValue(Error(reason));
    expect(await readJob(url, safeReader)).toBeNull();
    expect(safeReader).toHaveBeenCalledExactlyOnceWith(url);
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it.each(["", "short job", "<script>" + description + "</script>"])("returns no text for empty or short extracted content", async (body) => {
    const safeReader = vi.fn<SafeReader>().mockResolvedValue({ canonicalUrl: "https://careers.example.test/job", body });
    expect(await readJob("https://careers.example.test/job", safeReader)).toBeNull();
  });

  it("preserves the 80-character minimum", async () => {
    const safeReader = vi.fn<SafeReader>().mockResolvedValue({ canonicalUrl: "https://careers.example.test/job", body: "x".repeat(80) });
    expect(await readJob("https://careers.example.test/job", safeReader)).toBe("x".repeat(80));
  });
});
