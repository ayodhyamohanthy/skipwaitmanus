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

describe("malicious document rejection", () => {
  it("rejects legacy OLE Word documents", () => {
    const ole=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
    expect(()=>validatePrivateDocument({fileName:"resume.doc",mimeType:"application/msword",buffer:ole})).toThrow(/Legacy Word/);
  });
  it("rejects PDF active content and embedded files", async () => {
    const {sanitizePrivateDocument}=await import("./documentValidation");
    await expect(sanitizePrivateDocument({fileName:"resume.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.7\n1 0 obj <</OpenAction 2 0 R>> endobj\n%%EOF")})).rejects.toThrow(/active content/);
    await expect(sanitizePrivateDocument({fileName:"resume.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.7\n/EmbeddedFile\n%%EOF")})).rejects.toThrow(/embedded files/);
  });
  it("fully decodes and re-encodes images", async () => {
    const sharp=(await import("sharp")).default,{sanitizePrivateDocument}=await import("./documentValidation");
    const source=await sharp({create:{width:2,height:2,channels:4,background:"red"}}).png().toBuffer();
    const out=await sanitizePrivateDocument({fileName:"resume.png",mimeType:"image/png",buffer:source});
    expect(out.validatorVersion).toBe("builtin-v1");expect(out.buffer.subarray(0,8)).toEqual(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  });
});
