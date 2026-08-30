import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 document storage — drop-in replacement for the Forge/S3 proxy.
 *
 * R2 exposes an S3-compatible API, so the existing @aws-sdk client works
 * unchanged: storagePut uploads directly with the SDK (no presign round-trip
 * needed server-side), and storageGetSignedUrl issues time-limited presigned
 * GET URLs that redirect consumers already handle (307 pattern preserved).
 *
 * Credentials come from an R2 API token (Account > R2 > Manage API tokens):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 storage is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function r2Configured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: data, ContentType: contentType }));
  return { key, url: `/api/documents/by-key/${encodeURIComponent(key)}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return s3GetSignedUrl(client(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }), { expiresIn: 900 });
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: normalizeKey(relKey), url: await storageGetSignedUrl(relKey) };
}
