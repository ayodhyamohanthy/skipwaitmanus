import { readApiJson } from "@/lib/apiResponse";

export type ResumeDoc = { id: number; fileName: string };
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function mimeForResume(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function validateResumeFile(file: File): string | null {
  if (!mimeForResume(file)) return "Use a PDF, Word document, PNG, or JPEG resume.";
  if (file.size > MAX_DOCUMENT_BYTES) return `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Documents must be 10 MB or smaller.`;
  return null;
}

function bytesToBase64(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) output += String.fromCharCode(bytes[index] || 0);
  return btoa(output);
}

async function encryptChunk(blob: Blob) {
  if (!crypto?.subtle) throw new Error("Your browser cannot securely prepare this resume upload. Please update it and try again.");
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const source = new Uint8Array(await blob.arrayBuffer());
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, source);
  return { encryptedContent: bytesToBase64(new Uint8Array(encrypted)), encryptionKey: bytesToBase64(key), initializationVector: bytesToBase64(iv) };
}

/** Chunk-encrypted resume upload. Same protocol ReferralRequest uses; the
 * server chunk API is the contract both call sites target. */
export async function uploadResume(file: File, getToken: () => Promise<string | null>): Promise<ResumeDoc> {
  const mimeType = mimeForResume(file);
  if (!mimeType) throw new Error("Use a PDF, Word document, PNG, or JPEG resume");
  const token = await getToken();
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const startResponse = await fetch("/api/documents/uploads", { method: "POST", headers, credentials: "include", body: JSON.stringify({ clientUploadId: crypto.randomUUID(), fileName: file.name, mimeType, fileSize: file.size }) });
  const start = await readApiJson<{ sessionId?: string; chunkBytes?: number; error?: string }>(startResponse, "We could not prepare your private resume upload");
  if (!startResponse.ok || !start.sessionId || !start.chunkBytes) throw new Error(start.error || "We could not prepare your private resume upload");
  for (let offset = 0, index = 0; offset < file.size; offset += start.chunkBytes, index += 1) {
    const encrypted = await encryptChunk(file.slice(offset, Math.min(file.size, offset + start.chunkBytes)));
    const chunkResponse = await fetch(`/api/documents/uploads/${start.sessionId}/chunks`, { method: "POST", headers, credentials: "include", body: JSON.stringify({ chunkIndex: index, ...encrypted }) });
    if (!chunkResponse.ok) throw new Error("We could not save part of your resume. Please try again.");
  }
  const completeResponse = await fetch(`/api/documents/uploads/${start.sessionId}/complete`, { method: "POST", headers, credentials: "include" });
  const done = await readApiJson<ResumeDoc & { error?: string }>(completeResponse, "We could not verify your uploaded resume");
  if (!completeResponse.ok) throw new Error(done.error || "We could not verify your uploaded resume");
  return { id: done.id, fileName: done.fileName };
}
