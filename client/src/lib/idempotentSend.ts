// Shared idempotent-send helper (emergency DM hotfix).
//
// The server requires an `Idempotency-Key` header matching /^[\x21-\x7E]{16,64}$/
// on message sends (428 otherwise), replays the stored row with 200 when the
// same key is retried, and answers 409 when a key is reused with different
// content. This helper mints one cryptographically random key per pending
// attempt, binds it to an immutable fingerprint of workflow + recipient +
// normalized body, and reuses that exact key across timeout/retry/reload until
// the send is acknowledged. Retry is always explicit (user action); there is
// no background or automatic replay here.
//
// Only the pending send needed for recovery is persisted, in sessionStorage
// (never localStorage, never auth tokens). The shape is generic so the later
// referral-conversation migration can reuse it with its own workflow value.

export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{16,64}$/;
export const PENDING_SEND_VERSION = 1;
export const PENDING_SEND_TTL_MS = 24 * 60 * 60 * 1000;
export const DM_SEND_WORKFLOW = "dm";

export interface PendingSendRecord {
  version: typeof PENDING_SEND_VERSION;
  workflow: string;
  recipientKey: string;
  body: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface PendingSendStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BeginPendingSendInput {
  workflow: string;
  recipientKey: string;
  body: string;
  storage?: PendingSendStorage | null;
  now?: number;
}

export interface ReadPendingSendOptions {
  recipientKey?: string;
  storage?: PendingSendStorage | null;
  now?: number;
  maxAgeMs?: number;
}

export function normalizeMessageBody(body: string): string {
  return body.trim();
}

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && IDEMPOTENCY_KEY_PATTERN.test(key);
}

export function createIdempotencyKey(): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("A secure random generator is unavailable");
}

function storageKeyForWorkflow(workflow: string): string {
  return `skipwait:pending-send:${workflow}:v1`;
}

function resolveSessionStorage(override?: PendingSendStorage | null): PendingSendStorage | undefined {
  if (override !== undefined) return override ?? undefined;
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    return sessionStorage;
  } catch {
    return undefined;
  }
}

function isRecordShape(value: unknown): value is PendingSendRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["version"] === PENDING_SEND_VERSION &&
    typeof record["workflow"] === "string" &&
    record["workflow"] !== "" &&
    typeof record["recipientKey"] === "string" &&
    record["recipientKey"] !== "" &&
    typeof record["body"] === "string" &&
    record["body"] !== "" &&
    isValidIdempotencyKey(record["idempotencyKey"]) &&
    typeof record["createdAt"] === "number" &&
    Number.isFinite(record["createdAt"])
  );
}

export function readPendingSend(workflow: string, options?: ReadPendingSendOptions): PendingSendRecord | null {
  const storage = resolveSessionStorage(options?.storage);
  if (!storage || workflow === "") return null;
  const now = options?.now ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? PENDING_SEND_TTL_MS;
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKeyForWorkflow(workflow));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecordShape(parsed) || parsed.workflow !== workflow) return null;
  if (options?.recipientKey !== undefined && parsed.recipientKey !== options.recipientKey) return null;
  const age = now - parsed.createdAt;
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
  return {
    version: PENDING_SEND_VERSION,
    workflow: parsed.workflow,
    recipientKey: parsed.recipientKey,
    body: parsed.body,
    idempotencyKey: parsed.idempotencyKey,
    createdAt: parsed.createdAt,
  };
}

export function savePendingSend(record: PendingSendRecord, storage?: PendingSendStorage | null): void {
  const target = resolveSessionStorage(storage);
  if (!target) return;
  try {
    target.setItem(
      storageKeyForWorkflow(record.workflow),
      JSON.stringify({
        version: PENDING_SEND_VERSION,
        workflow: record.workflow,
        recipientKey: record.recipientKey,
        body: record.body,
        idempotencyKey: record.idempotencyKey,
        createdAt: record.createdAt,
      } satisfies PendingSendRecord),
    );
  } catch {
    // Persistence is best-effort recovery state; the send still carries the key.
  }
}

export function clearPendingSend(workflow: string, storage?: PendingSendStorage | null): void {
  const target = resolveSessionStorage(storage);
  if (!target || workflow === "") return;
  try {
    target.removeItem(storageKeyForWorkflow(workflow));
  } catch {
    // Clearing is best-effort; a stale record expires via TTL on read.
  }
}

export function beginPendingSend(input: BeginPendingSendInput): { record: PendingSendRecord; reused: boolean } {
  const normalized = normalizeMessageBody(input.body);
  const now = input.now ?? Date.now();
  const existing = readPendingSend(input.workflow, {
    recipientKey: input.recipientKey,
    storage: input.storage,
    now,
  });
  if (existing && existing.body === normalized) return { record: existing, reused: true };
  const record: PendingSendRecord = {
    version: PENDING_SEND_VERSION,
    workflow: input.workflow,
    recipientKey: input.recipientKey,
    body: normalized,
    idempotencyKey: createIdempotencyKey(),
    createdAt: now,
  };
  savePendingSend(record, input.storage);
  return { record, reused: false };
}
