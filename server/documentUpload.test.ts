import { describe, expect, it } from "vitest";
import { dataUrlToBuffer, sanitizeDocumentName } from "./documentUpload";

describe("document upload helpers", () => {
  it("keeps storage filenames safe", () => {
    expect(sanitizeDocumentName("Avery's résumé (final).pdf")).toBe("Avery_s_r_sum___final_.pdf");
  });

  it("decodes base64 document payloads", () => {
    expect(dataUrlToBuffer("data:text/plain;base64,SGVsbG8=").toString()).toBe("Hello");
  });
});
