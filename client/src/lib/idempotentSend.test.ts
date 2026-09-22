import { describe, expect, it, vi } from "vitest";
import {
  DM_SEND_WORKFLOW,
  IDEMPOTENCY_KEY_PATTERN,
  PENDING_SEND_TTL_MS,
  beginPendingSend,
  clearPendingSend,
  createIdempotencyKey,
  isValidIdempotencyKey,
  normalizeMessageBody,
  readPendingSend,
  savePendingSend,
  type PendingSendStorage,
} from "./idempotentSend";

function memoryStorage(values = new Map<string, string>()): PendingSendStorage {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("idempotentSend helper", () => {
  it("mints keys matching the server 16-64 printable contract", () => {
    for (let index = 0; index < 25; index += 1) {
      const key = createIdempotencyKey();
      expect(IDEMPOTENCY_KEY_PATTERN.test(key)).toBe(true);
      expect(isValidIdempotencyKey(key)).toBe(true);
    }
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("has space inside key value")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(65))).toBe(false);
  });

  it("normalizes the body before fingerprinting", () => {
    expect(normalizeMessageBody("  hello  ")).toBe("hello");
  });

  it("reuses the same key for the same pending attempt", () => {
    const storage = memoryStorage();
    const first = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: " hello ", storage });
    const second = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.record.idempotencyKey).toBe(first.record.idempotencyKey);
    expect(second.record.body).toBe("hello");
  });

  it("mints a fresh key when the body changes on a deliberate new send", () => {
    const storage = memoryStorage();
    const first = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage });
    const second = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "changed", storage });
    expect(second.reused).toBe(false);
    expect(second.record.idempotencyKey).not.toBe(first.record.idempotencyKey);
  });

  it("scopes pending state per recipient and workflow", () => {
    const storage = memoryStorage();
    beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage });
    expect(readPendingSend(DM_SEND_WORKFLOW, { recipientKey: "33", storage })).toBeNull();
    expect(readPendingSend("referral-conversation", { storage })).toBeNull();
    expect(readPendingSend(DM_SEND_WORKFLOW, { recipientKey: "22", storage })?.body).toBe("hello");
    clearPendingSend(DM_SEND_WORKFLOW, storage);
    expect(readPendingSend(DM_SEND_WORKFLOW, { recipientKey: "22", storage })).toBeNull();
  });

  it("discards malformed or stale records safely", () => {
    const values = new Map<string, string>();
    const storage = memoryStorage(values);
    const key = "skipwait:pending-send:dm:v1";
    for (const malformed of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, workflow: "dm", recipientKey: "22", body: "hi", idempotencyKey: createIdempotencyKey(), createdAt: Date.now() }),
      JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "hi", idempotencyKey: "short", createdAt: Date.now() }),
      JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "", idempotencyKey: createIdempotencyKey(), createdAt: Date.now() }),
      JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "hi", idempotencyKey: createIdempotencyKey(), createdAt: "yesterday" }),
      JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "hi", idempotencyKey: createIdempotencyKey(), createdAt: Date.now() - PENDING_SEND_TTL_MS - 1000 }),
      JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "hi", idempotencyKey: createIdempotencyKey(), createdAt: Date.now() + 60_000 }),
    ]) {
      values.set(key, malformed);
      expect(readPendingSend(DM_SEND_WORKFLOW, { recipientKey: "22", storage })).toBeNull();
    }
  });

  it("never touches localStorage and survives unavailable storage", () => {
    const localStorageAccess = vi.fn(() => {
      throw new Error("localStorage must not be used");
    });
    Object.defineProperty(globalThis, "localStorage", { get: localStorageAccess, configurable: true });
    try {
      expect(readPendingSend(DM_SEND_WORKFLOW, { storage: null })).toBeNull();
      expect(() => clearPendingSend(DM_SEND_WORKFLOW, null)).not.toThrow();
      const attempt = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage: null });
      expect(isValidIdempotencyKey(attempt.record.idempotencyKey)).toBe(true);
      expect(localStorageAccess).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("persists only the recovery fields, never tokens", () => {
    const values = new Map<string, string>();
    const storage = memoryStorage(values);
    beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage });
    const stored = JSON.parse(values.get("skipwait:pending-send:dm:v1") ?? "{}") as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["body", "createdAt", "idempotencyKey", "recipientKey", "version", "workflow"]);
  });

  it("keeps the helper generic for the later referral-conversation migration", () => {
    const storage = memoryStorage();
    const dm = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: "22", body: "hello", storage });
    const referral = beginPendingSend({ workflow: "referral-conversation:601", recipientKey: "partner", body: "hello", storage });
    expect(referral.record.idempotencyKey).not.toBe(dm.record.idempotencyKey);
    expect(readPendingSend("referral-conversation:601", { recipientKey: "partner", storage })?.body).toBe("hello");
    savePendingSend(dm.record, storage);
    expect(readPendingSend(DM_SEND_WORKFLOW, { recipientKey: "22", storage })?.body).toBe("hello");
  });
});
