import { describe, expect, it } from "vitest";
import { validatePrivateDocument } from "./documentValidation";

describe("private document validation", () => {
  it("accepts a PDF only when filename, MIME type, and binary signature agree", () => {
    expect(validatePrivateDocument({ fileName: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nresume") })).toMatchObject({ mimeType: "application/pdf", fileSize: 15 });
  });

  it("rejects a caller-supplied MIME type that does not match the file extension", () => {
    expect(() => validatePrivateDocument({ fileName: "resume.pdf", mimeType: "image/png", buffer: Buffer.from("%PDF-1.7") })).toThrow(/does not match/i);
  });

  it("rejects an executable or HTML payload disguised as a supported document", () => {
    expect(() => validatePrivateDocument({ fileName: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") })).toThrow(/does not match/i);
  });
});
