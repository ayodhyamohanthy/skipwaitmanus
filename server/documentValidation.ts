const MAX_PRIVATE_DOCUMENT_BYTES = 10 * 1024 * 1024;

const allowedDocuments = {
  ".pdf": { mimeType: "application/pdf", signature: (buffer: Buffer) => buffer.subarray(0, 5).toString("ascii") === "%PDF-" },
  ".doc": { mimeType: "application/msword", signature: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: (buffer: Buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
  ".png": { mimeType: "image/png", signature: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  ".jpg": { mimeType: "image/jpeg", signature: (buffer: Buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  ".jpeg": { mimeType: "image/jpeg", signature: (buffer: Buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
} as const;

export const acceptedPrivateDocumentTypes = Object.values(allowedDocuments).map(item => item.mimeType);

export function validatePrivateDocument(input: { fileName: string; mimeType: string; buffer: Buffer }) {
  const fileName = input.fileName.trim();
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase() as keyof typeof allowedDocuments;
  const definition = allowedDocuments[extension];
  if (!definition) throw new Error("Use a PDF, Word document, PNG, or JPEG resume");
  if (input.mimeType !== definition.mimeType) throw new Error("The file type does not match its extension");
  if (input.buffer.length === 0 || input.buffer.length > MAX_PRIVATE_DOCUMENT_BYTES) throw new Error("Documents must be smaller than 10 MB");
  if (!definition.signature(input.buffer)) throw new Error("The uploaded file does not match its declared document type");
  return { fileName, mimeType: definition.mimeType, fileSize: input.buffer.length };
}
