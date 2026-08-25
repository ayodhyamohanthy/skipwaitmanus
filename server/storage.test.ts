import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storageGet, storageGetSignedUrl, storagePut } from "./storage";

const env = vi.hoisted(() => ({ ENV: { forgeApiUrl: "", forgeApiKey: "" } }));

vi.mock("./_core/env", () => env);

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("Forge-backed document storage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    env.ENV.forgeApiUrl = "https://forge.example.com/";
    env.ENV.forgeApiKey = "forge-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to upload or sign when the Forge credentials are absent", async () => {
    env.ENV.forgeApiKey = "";
    await expect(storagePut("private/resume.pdf", Buffer.from("pdf"))).rejects.toThrow("Storage config missing");
    await expect(storageGetSignedUrl("private/resume.pdf")).rejects.toThrow("Storage config missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("presigns with the trimmed Forge base URL and uploads the document directly to S3", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://s3.example.com/put?sig=1" })).mockResolvedValueOnce(jsonResponse({}, 200));

    const result = await storagePut("/private/resume.pdf", Buffer.from("pdf"), "application/pdf");

    const [presignUrl, presignInit] = fetchMock.mock.calls[0];
    expect(String(presignUrl)).toContain("https://forge.example.com/v1/storage/presign/put?path=private%2Fresume");
    expect(presignInit.headers.Authorization).toBe("Bearer forge-key");

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe("https://s3.example.com/put?sig=1");
    expect(uploadInit.method).toBe("PUT");
    expect(uploadInit.headers["Content-Type"]).toBe("application/pdf");
    expect(await (uploadInit.body as Blob).text()).toBe("pdf");

    expect(result.key).toMatch(/^private\/resume_[0-9a-f]{8}\.pdf$/);
    expect(result.url).toBe(`/manus-storage/${result.key}`);
  });

  it("gives every upload a distinct key and keeps the suffix on an extensionless key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://s3.example.com/put" }));

    const first = await storagePut("private/resume.pdf", "pdf");
    const second = await storagePut("private/resume.pdf", "pdf");
    const extensionless = await storagePut("private/resume", "pdf");

    expect(first.key).not.toBe(second.key);
    expect(extensionless.key).toMatch(/^private\/resume_[0-9a-f]{8}$/);
  });

  it("reports a failed presign, an empty presign URL, and a failed S3 upload distinctly", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden", text: async () => "denied" } as unknown as Response);
    await expect(storagePut("private/resume.pdf", "pdf")).rejects.toThrow("Storage presign failed (403): denied");

    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(storagePut("private/resume.pdf", "pdf")).rejects.toThrow("Forge returned empty presign URL");

    fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://s3.example.com/put" })).mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(storagePut("private/resume.pdf", "pdf")).rejects.toThrow("Storage upload to S3 failed (500)");
  });

  it("maps a stored key to its proxied download path without contacting Forge", async () => {
    expect(await storageGet("/private/resume_1234abcd.pdf")).toEqual({ key: "private/resume_1234abcd.pdf", url: "/manus-storage/private/resume_1234abcd.pdf" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the Forge signed download URL and surfaces a signing failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://s3.example.com/get?sig=2" }));
    expect(await storageGetSignedUrl("/private/resume.pdf")).toBe("https://s3.example.com/get?sig=2");
    expect(String(fetchMock.mock.calls[0][0])).toContain("v1/storage/presign/get?path=private%2Fresume.pdf");

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", text: async () => "missing" } as unknown as Response);
    await expect(storageGetSignedUrl("private/resume.pdf")).rejects.toThrow("Storage signed URL failed (404): missing");
  });
});
