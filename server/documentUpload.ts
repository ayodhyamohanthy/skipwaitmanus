export function sanitizeDocumentName(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return safeName || "document";
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("Invalid document payload");
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}
