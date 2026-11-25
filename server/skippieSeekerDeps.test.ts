import { afterEach, describe, expect, it, vi } from "vitest";
import * as deps from "./skippieSeekerDeps";
import type { fetchPublicJobLink } from "./jobLinkPreview";

const quoteDb = vi.hoisted(() => ({ wallet: vi.fn(async () => ({ totalAvailable: 3 })), banded: vi.fn() }));
vi.mock("./db", () => ({ getTokenWallet: quoteDb.wallet, previewBandedAskCost: quoteDb.banded }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

type SafeReader = typeof fetchPublicJobLink;
const readJob = (deps as unknown as {
  fetchJobText: (url: string, reader?: SafeReader) => Promise<string | null>;
}).fetchJobText;
const description = "Build reliable public referral tools with clear ownership and good tests. ".repeat(3);

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Skippy authoritative quote dependency", () => {
  it("uses the banded quote for the authenticated seeker and normalized link", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    const quote = { level: 5, cost: 1, totalAvailable: 2, shortfall: 0, coverageStatus: "covered", acceptedCost: { units: 1, band: "senior", source: [{ bucket: "free", units: 1, cycleKey: "2026-11" }] } };
    quoteDb.banded.mockResolvedValueOnce(quote);
    expect(await deps.createSkippieSeekerDeps().getQuote(7, "careers.acme.com/jobs/123")).toEqual(quote);
    expect(quoteDb.banded).toHaveBeenCalledExactlyOnceWith(7, "https://careers.acme.com/jobs/123");
    expect(quoteDb.wallet).not.toHaveBeenCalled();
  });

  it("keeps the legacy quote shape while banded sales are off", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "false");
    vi.stubEnv("ASK_LEVEL_COST", "false");
    const quote = await deps.createSkippieSeekerDeps().getQuote(8, "https://careers.acme.com/jobs/123");
    expect(quote).toMatchObject({ cost: 1, totalAvailable: 3, shortfall: 0 });
    expect(quote.acceptedCost).toBeUndefined();
    expect(quoteDb.wallet).toHaveBeenCalledExactlyOnceWith(8, "job_seeker");
    expect(quoteDb.banded).not.toHaveBeenCalled();
  });

  it("does not fall back to a legacy wallet if the authoritative quote fails", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");
    quoteDb.banded.mockRejectedValueOnce(new Error("quote unavailable"));
    await expect(deps.createSkippieSeekerDeps().getQuote(7, "https://careers.acme.com/jobs/123")).rejects.toThrow("quote unavailable");
    expect(quoteDb.wallet).not.toHaveBeenCalled();
  });
});

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
