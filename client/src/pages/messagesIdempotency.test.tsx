// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Messages from "./Messages";
import { IDEMPOTENCY_KEY_PATTERN, createIdempotencyKey } from "@/lib/idempotentSend";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const PENDING_KEY = "skipwait:pending-send:dm:v1";
const nowIso = new Date().toISOString();

type ThreadMessage = { id: number; body: string; createdAt: string; isMine: boolean };

function threadPayload(counterpartUserId: number, messages: ThreadMessage[]) {
  return { thread: { counterpartUserId, counterpartLabel: `Referrer · user${counterpartUserId}.com`, messages } };
}

function threadsListPayload(ids: number[]) {
  return {
    threads: ids.map((counterpartUserId) => ({
      counterpartUserId,
      counterpartLabel: `Referrer · user${counterpartUserId}.com`,
      lastMessageBody: "Hello",
      lastMessageIsMine: false,
      lastMessageAt: nowIso,
      unreadCount: 0,
    })),
  };
}

type PostCall = { key: string; body: string };
type PostResponder = (call: PostCall, attempt: number) => unknown;

function setupFetch(options: { threadIds?: number[]; threads?: Record<number, ThreadMessage[]>; post?: PostResponder }) {
  const posts: PostCall[] = [];
  let attempts = 0;
  const threadIds = options.threadIds ?? [22];
  const threads = options.threads ?? { 22: [{ id: 1, body: "Hello", createdAt: nowIso, isMine: false }] };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/dms/threads") return { ok: true, json: async () => threadsListPayload(threadIds) };
    if (typeof init?.method === "string" && init.method === "POST") {
      attempts += 1;
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call = { key: headers["Idempotency-Key"] ?? "", body: String(init.body ?? "") };
      posts.push(call);
      return (options.post?.(call, attempts) ?? { ok: true, status: 201, json: async () => ({ message: { id: 100 + attempts } }) }) as unknown;
    }
    const match = url.match(/^\/api\/dms\/threads\/(\d+)$/);
    if (match) return { ok: true, json: async () => threadPayload(Number(match[1]), threads[Number(match[1])] ?? []) };
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posts };
}

async function openThread(counterpartUserId: number) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Referrer · user${counterpartUserId}\\.com`) }));
  await screen.findByPlaceholderText("Write a message");
}

async function typeAndSend(text: string) {
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

function readPendingBody(): string | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { body?: string }).body ?? null;
  } catch {
    return null;
  }
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Messages idempotent send", () => {
  it("sends Idempotency-Key and clears pending state and draft on 201, appending once", async () => {
    const { posts } = setupFetch({});
    render(<Messages />);
    await openThread(22);
    await typeAndSend("Hello there");
    await waitFor(() => expect(screen.getAllByText("Hello there")).toHaveLength(1));
    expect(posts).toHaveLength(1);
    expect(IDEMPOTENCY_KEY_PATTERN.test(posts[0].key)).toBe(true);
    expect(JSON.parse(posts[0].body)).toEqual({ body: "Hello there" });
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("preserves draft and reuses the exact key after a lost response, then appends once on 200 replay", async () => {
    const { posts } = setupFetch({
      post: (_call, attempt) => {
        if (attempt === 1) throw new Error("NetworkError");
        return { ok: true, status: 200, json: async () => ({ message: { id: 7, replayed: true } }) };
      },
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("Hello there");
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toContain("NetworkError"));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hello there");
    const firstKey = posts[0].key;
    expect(IDEMPOTENCY_KEY_PATTERN.test(firstKey)).toBe(true);
    expect(readPendingBody()).toBe("Hello there");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getAllByText("Hello there")).toHaveLength(1));
    expect(posts).toHaveLength(2);
    expect(posts[1].key).toBe(firstKey);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("does not append a duplicate on 200 replay for an already-present server message id", async () => {
    const { posts } = setupFetch({
      threads: { 22: [{ id: 9, body: "Earlier note", createdAt: nowIso, isMine: true }] },
      post: () => ({ ok: true, status: 200, json: async () => ({ message: { id: 9, replayed: true } }) }),
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("brand new text");
    await waitFor(() => expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(""));
    expect(posts).toHaveLength(1);
    expect(screen.queryByText("brand new text")).toBeNull();
    expect(screen.getAllByText("Earlier note")).toHaveLength(1);
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("handles 409 by preserving text and requiring a deliberate retry with a fresh key", async () => {
    let conflict = true;
    const { fetchMock, posts } = setupFetch({
      post: () => {
        if (conflict) return { ok: false, status: 409, json: async () => ({ error: "This message key was already used for different content" }) };
        return { ok: true, status: 201, json: async () => ({ message: { id: 8 } }) };
      },
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("changed mind");
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toMatch(/fresh attempt/i));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("changed mind");
    expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
    const poisonedKey = posts[0].key;
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    conflict = false;
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getAllByText("changed mind")).toHaveLength(1));
    expect(posts).toHaveLength(2);
    expect(posts[1].key).not.toBe(poisonedKey);
    expect(IDEMPOTENCY_KEY_PATTERN.test(posts[1].key)).toBe(true);
  });

  it("preserves draft and the pending key on 428", async () => {
    const { fetchMock, posts } = setupFetch({
      post: () => ({ ok: false, status: 428, json: async () => ({ error: "A valid Idempotency-Key header is required" }) }),
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("needs a key");
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toContain("Idempotency-Key"));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("needs a key");
    expect(readPendingBody()).toBe("needs a key");
    expect(IDEMPOTENCY_KEY_PATTERN.test(posts[0].key)).toBe(true);
    expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });

  it("shows retryAt copy on 429 and preserves draft and the pending key", async () => {
    const retryAt = "2026-09-22T12:30:00.000Z";
    const { posts } = setupFetch({
      post: () => ({ ok: false, status: 429, json: async () => ({ error: "You're sending messages too quickly.", retryAt }) }),
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("slow down");
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toContain("Try again after"));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("slow down");
    expect(readPendingBody()).toBe("slow down");
    expect(IDEMPOTENCY_KEY_PATTERN.test(posts[0].key)).toBe(true);
  });

  it("produces one in-flight request on double-click", async () => {
    let resolvePost!: (value: unknown) => void;
    const gate = new Promise<unknown>((resolve) => {
      resolvePost = resolve;
    });
    const { posts } = setupFetch({ post: () => gate });
    render(<Messages />);
    await openThread(22);
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "double tap" } });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    await waitFor(() => expect(posts).toHaveLength(1));
    resolvePost({ ok: true, status: 201, json: async () => ({ message: { id: 11 } }) });
    await waitFor(() => expect(screen.getAllByText("double tap")).toHaveLength(1));
    expect(posts).toHaveLength(1);
  });

  it("restores the pending draft and key only for the matching recipient after reload", async () => {
    const first = setupFetch({ threadIds: [22, 33], post: () => { throw new Error("NetworkError"); } });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("Unfinished business");
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toContain("NetworkError"));
    const pendingKey = first.posts[0].key;
    cleanup();

    const second = setupFetch({ threadIds: [22, 33] });
    render(<Messages />);
    await openThread(33);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByText("All chats"));
    await openThread(22);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Unfinished business");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getAllByText("Unfinished business")).toHaveLength(1));
    expect(second.posts).toHaveLength(1);
    expect(second.posts[0].key).toBe(pendingKey);
  });

  it("ignores malformed, stale, and other-recipient pending records", async () => {
    const staleKey = createIdempotencyKey();
    const otherKey = createIdempotencyKey();
    const cases: Array<{ seed: string; label: string }> = [
      { seed: "not json", label: "malformed" },
      {
        seed: JSON.stringify({ version: 1, workflow: "dm", recipientKey: "22", body: "stale text", idempotencyKey: staleKey, createdAt: 1 }),
        label: "stale",
      },
      {
        seed: JSON.stringify({ version: 1, workflow: "dm", recipientKey: "99", body: "elsewhere", idempotencyKey: otherKey, createdAt: Date.now() }),
        label: "other-recipient",
      },
    ];
    for (const { seed } of cases) {
      sessionStorage.setItem(PENDING_KEY, seed);
      const { posts } = setupFetch({});
      render(<Messages />);
      await openThread(22);
      expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
      await typeAndSend("Fresh start");
      await waitFor(() => expect(screen.getAllByText("Fresh start")).toHaveLength(1));
      expect(posts).toHaveLength(1);
      expect(posts[0].key).not.toBe(staleKey);
      expect(posts[0].key).not.toBe(otherKey);
      expect(IDEMPOTENCY_KEY_PATTERN.test(posts[0].key)).toBe(true);
      cleanup();
      sessionStorage.clear();
    }
  });

  it("preserves the draft on 402", async () => {
    setupFetch({
      post: () => ({ ok: false, status: 402, json: async () => ({ error: "Direct messaging is a premium feature.", upgrade: true }) }),
    });
    render(<Messages />);
    await openThread(22);
    await typeAndSend("Prose before pro");
    await waitFor(() => expect(screen.getAllByText(/Direct messaging is for members/).length).toBeGreaterThan(0));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Prose before pro");
  });
});
