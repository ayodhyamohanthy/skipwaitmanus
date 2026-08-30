export function sanitizeDocumentName(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return safeName || "document";
}

/** Base64 length that still decodes to less than the 10 MB document ceiling. */
const MAX_DATA_URL_LENGTH = 14_500_000;

export function dataUrlToBuffer(dataUrl: string): Buffer {
  if (!dataUrl.startsWith("data:") || dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Invalid document payload");
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("Invalid document payload");
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}
