// @vitest-environment node
// XINGCHI-turn-guard (D-403): a local proxy compacts a conversation before the Xingchi relay's turn limits (20 user
// turns, 100 model replies) and retries once on `session_turn_limit_exceeded`. The pure rules first (which request is
// parsed, how turns are counted in both formats, where the middle may be cut), then the proxy itself against a fake
// upstream on 127.0.0.1, so forwarding, streaming, secrecy of the Authorization header and the retry are proven
// without a real relay.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  COMPACT_NOTE_END, COMPACT_NOTE_START, compactBody, compactNote, countTurns, createGuardServer, isTurnLimitError,
  parseArgs, requestKind, upstreamPath, usage,
} from "./xingchi-guard.mjs";

type Msg = Record<string, unknown>;
const LIMITS = { maxUser: 18, maxModel: 95 };
const sys = (content: string): Msg => ({ role: "system", content });
const user = (content: string): Msg => ({ role: "user", content });
const assistant = (content: string): Msg => ({ role: "assistant", content });
const callMsg = (...ids: string[]): Msg => ({
  role: "assistant", content: null,
  tool_calls: ids.map((id) => ({ id, type: "function", function: { name: "bash", arguments: "{}" } })),
});
const toolMsg = (id: string): Msg => ({ role: "tool", tool_call_id: id, content: `result ${id}` });
const rUser = (text: string): Msg => ({ type: "message", role: "user", content: [{ type: "input_text", text }] });
const rAssistant = (text: string): Msg => ({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
const rDev = (text: string): Msg => ({ type: "message", role: "developer", content: [{ type: "input_text", text }] });
const rReasoning = (id: string): Msg => ({ type: "reasoning", id, summary: [] });
const rCall = (callId: string): Msg => ({ type: "function_call", call_id: callId, name: "bash", arguments: "{}" });
const rOutput = (callId: string): Msg => ({ type: "function_call_output", call_id: callId, output: "ok" });
const isNote = (m: Msg) => JSON.stringify(m).includes(COMPACT_NOTE_START);

function chatConversation(pairs: number): Msg[] {
  const messages: Msg[] = [sys("You are a coding agent."), user("FIRST TASK")];
  for (let i = 0; i < pairs; i++) messages.push(assistant(`reply ${i}`), user(`follow-up ${i}`));
  messages.push(assistant("last reply"), user("LAST QUESTION"));
  return messages;
}

function chatToolConversation(cycles: number): Msg[] {
  const messages: Msg[] = [sys("system"), user("FIRST TASK")];
  for (let i = 0; i < cycles; i++) {
    if (i % 3 === 0) messages.push(callMsg(`c${i}a`, `c${i}b`), toolMsg(`c${i}a`), toolMsg(`c${i}b`));
    else messages.push(callMsg(`c${i}`), toolMsg(`c${i}`));
    if (i % 10 === 9) messages.push(assistant(`summary ${i}`), user(`continue ${i}`));
  }
  messages.push(assistant("done"));
  return messages;
}

function responsesConversation(cycles: number): Msg[] {
  const input: Msg[] = [rDev("developer rules"), rUser("FIRST TASK")];
  for (let i = 0; i < cycles; i++) {
    input.push(rReasoning(`rs${i}`), rCall(`call${i}a`), rCall(`call${i}b`), rOutput(`call${i}a`), rOutput(`call${i}b`));
    input.push(rAssistant(`answer ${i}`));
    if (i % 8 === 7) input.push(rUser(`continue ${i}`));
  }
  input.push(rUser("LAST QUESTION"));
  return input;
}

describe("requestKind: only POST chat/completions and responses bodies are parsed", () => {
  it("recognises both formats under any base path and ignores everything else", () => {
    expect(requestKind("POST", "/v1/chat/completions")).toBe("chat");
    expect(requestKind("POST", "/chat/completions?stream=true")).toBe("chat");
    expect(requestKind("POST", "/api/v1/responses")).toBe("responses");
    expect(requestKind("GET", "/v1/chat/completions")).toBeNull();
    expect(requestKind("POST", "/v1/embeddings")).toBeNull();
    expect(requestKind("POST", "/v1/responses/resp_1/cancel")).toBeNull();
  });
});

describe("countTurns", () => {
  it("chat: user messages are user turns, assistant messages are model replies, tool results are neither", () => {
    const messages = [sys("s"), user("u1"), assistant("a1"), user("u2"), callMsg("x"), toolMsg("x"), assistant("a2")];
    expect(countTurns("chat", { messages })).toEqual({ user: 2, model: 3 });
  });

  it("responses: one run of model output items (reasoning, calls, assistant messages) is one model reply", () => {
    const input = [rDev("d"), rUser("u1"), rReasoning("r1"), rCall("k1"), rOutput("k1"), rAssistant("a1"), rUser("u2"), rAssistant("a2")];
    expect(countTurns("responses", { input })).toEqual({ user: 2, model: 3 });
  });

  it("a string input, a missing array or an unknown body counts nothing", () => {
    expect(countTurns("responses", { input: "hello" })).toEqual({ user: 0, model: 0 });
    expect(countTurns("chat", { prompt: "x" })).toEqual({ user: 0, model: 0 });
    expect(countTurns("chat", null)).toEqual({ user: 0, model: 0 });
  });
});

describe("compactBody", () => {
  it("leaves a conversation under both limits untouched (same object, nothing compacted)", () => {
    const body = { model: "m", messages: chatConversation(5) };
    const result = compactBody("chat", body, LIMITS);
    expect(result.compacted).toBe(false);
    expect(result.body).toBe(body);
  });

  it("chat: at the user limit, keeps system + first user + the latest turns and lands at about half the limits", () => {
    const body = { model: "m", stream: true, messages: chatConversation(30) };
    expect(countTurns("chat", body).user).toBeGreaterThanOrEqual(18);
    const result = compactBody("chat", body, LIMITS);
    expect(result.compacted).toBe(true);
    const out = result.body.messages as Msg[];
    expect(out[0]).toEqual(sys("You are a coding agent."));
    expect(out[1]).toEqual(user("FIRST TASK"));
    expect(isNote(out[2])).toBe(true);
    expect(out.at(-1)).toEqual(user("LAST QUESTION"));
    expect(out.at(-2)).toEqual(assistant("last reply"));
    expect(result.body.model).toBe("m");
    expect(result.body.stream).toBe(true);
    const after = countTurns("chat", result.body);
    expect(after.user).toBeLessThanOrEqual(9);
    expect(after.model).toBeLessThanOrEqual(47);
    expect(after.user).toBeGreaterThanOrEqual(7);
    expect(result.after).toEqual(after);
    expect(result.before).toEqual(countTurns("chat", body));
    expect(body.messages).toHaveLength(chatConversation(30).length);
  });

  it("chat: keeps a system message from the middle and inserts exactly one note naming the turns removed", () => {
    const messages = chatConversation(30);
    messages.splice(20, 0, sys("mid-conversation system rule"));
    const result = compactBody("chat", { messages }, LIMITS);
    const out = result.body.messages as Msg[];
    expect(out).toContainEqual(sys("mid-conversation system rule"));
    const notes = out.filter(isNote);
    expect(notes).toHaveLength(1);
    expect(notes[0].role).toBe("user");
    const text = String(notes[0].content);
    expect(text).toBe(compactNote(result.removed));
    expect(text.startsWith(COMPACT_NOTE_START)).toBe(true);
    expect(text.endsWith(COMPACT_NOTE_END)).toBe(true);
    expect(text).toBe(`[Earlier conversation compacted by xingchi-guard: ${result.removed} turns removed to stay under the provider's turn limit. Re-read your task packet, the picker output and git log for anything you need.]`);
    const before = countTurns("chat", { messages });
    expect(result.removed).toBe(before.user + before.model - (result.after.user - 1) - result.after.model);
  });

  it("chat: at the model limit, never separates an assistant tool_calls message from its tool results", () => {
    const body = { messages: chatToolConversation(110) };
    expect(countTurns("chat", body).model).toBeGreaterThanOrEqual(95);
    const result = compactBody("chat", body, LIMITS);
    expect(result.compacted).toBe(true);
    const out = result.body.messages as Msg[];
    const callIds = new Set<string>();
    const resultIds = new Set<string>();
    out.forEach((m, i) => {
      if (m.role === "tool") {
        expect(i).toBeGreaterThan(0);
        expect(isNote(out[i - 1])).toBe(false);
        resultIds.add(String(m.tool_call_id));
      }
      for (const call of (m.tool_calls as Array<{ id: string }> | undefined) ?? []) callIds.add(call.id);
    });
    expect([...resultIds].sort()).toEqual([...callIds].sort());
    expect(countTurns("chat", result.body).model).toBeLessThanOrEqual(47);
    expect(out.at(-1)).toEqual(assistant("done"));
  });

  it("responses: never separates a function_call from its output, nor a reasoning item from what follows it", () => {
    const body = { model: "m", input: responsesConversation(100) };
    expect(countTurns("responses", body).model).toBeGreaterThanOrEqual(95);
    const result = compactBody("responses", body, LIMITS);
    expect(result.compacted).toBe(true);
    const out = result.body.input as Msg[];
    expect(out[0]).toEqual(rDev("developer rules"));
    expect(out[1]).toEqual(rUser("FIRST TASK"));
    expect(isNote(out[2])).toBe(true);
    expect(out[2]).toMatchObject({ type: "message", role: "user" });
    expect(out.at(-1)).toEqual(rUser("LAST QUESTION"));
    const calls = out.filter((m) => m.type === "function_call").map((m) => m.call_id).sort();
    const outputs = out.filter((m) => m.type === "function_call_output").map((m) => m.call_id).sort();
    expect(outputs).toEqual(calls);
    const original = body.input;
    out.forEach((m, i) => {
      if (m.type !== "reasoning") return;
      const at = original.indexOf(m);
      expect(out[i + 1]).toBe(original[at + 1]);
    });
    expect(["reasoning", "message"]).toContain(out[3].type);
    const after = countTurns("responses", result.body);
    expect(after.model).toBeLessThanOrEqual(47);
    expect(after.user).toBeLessThanOrEqual(9);
  });

  it("forced compaction to a quarter of the limits (the retry path) goes lower still", () => {
    const body = { messages: chatConversation(12) };
    expect(compactBody("chat", body, LIMITS).compacted).toBe(false);
    const result = compactBody("chat", body, { maxUser: 9, maxModel: 47 }, { force: true });
    expect(result.compacted).toBe(true);
    expect(result.after.user).toBeLessThanOrEqual(4);
    expect(result.after.model).toBeLessThanOrEqual(23);
  });

  it("unknown or unparseable shapes pass through unchanged", () => {
    for (const [kind, body] of [["chat", { foo: 1 }], ["responses", { input: "plain string" }], ["chat", "text"], ["responses", null]] as const) {
      const result = compactBody(kind, body, LIMITS, { force: true });
      expect(result.compacted).toBe(false);
      expect(result.body).toBe(body);
    }
  });
});

describe("isTurnLimitError", () => {
  it("is only a 400 whose body names session_turn_limit_exceeded", () => {
    const text = JSON.stringify({ error: { type: "invalid_request_error", param: "session_turn_limit_exceeded", message: "This conversation has reached 100 model turns." } });
    expect(isTurnLimitError(400, text)).toBe(true);
    expect(isTurnLimitError(429, text)).toBe(false);
    expect(isTurnLimitError(400, '{"error":{"message":"bad"}}')).toBe(false);
  });
});

describe("upstreamPath and parseArgs", () => {
  it("joins the upstream base path once, whether the client sent it or not", () => {
    expect(upstreamPath("/v1", "/v1/chat/completions")).toBe("/v1/chat/completions");
    expect(upstreamPath("/v1", "/chat/completions")).toBe("/v1/chat/completions");
    expect(upstreamPath("/v1", "/v1")).toBe("/v1");
    expect(upstreamPath("/v1", "/v10/models")).toBe("/v1/v10/models");
    expect(upstreamPath("", "/v1/models?x=1")).toBe("/v1/models?x=1");
    expect(upstreamPath("/openai/v1", "/openai/v1/responses")).toBe("/openai/v1/responses");
  });

  it("reads flags and XINGCHI_BASE_URL, with the documented defaults", () => {
    expect(parseArgs(["--upstream", "https://relay.example/v1"], {})).toMatchObject({ port: 8787, maxUser: 18, maxModel: 95, upstream: "https://relay.example/v1" });
    expect(parseArgs(["--port", "9000", "--max-user", "10", "--max-model", "50"], { XINGCHI_BASE_URL: "https://relay.example" })).toMatchObject({ port: 9000, maxUser: 10, maxModel: 50, upstream: "https://relay.example" });
    expect(parseArgs(["--help"], {})).toMatchObject({ help: true });
    expect(() => parseArgs([], {})).toThrow(/upstream/);
    expect(() => parseArgs(["--upstream", "ftp://x"], {})).toThrow(/upstream/);
    expect(() => parseArgs(["--upstream", "https://x", "--max-user", "zero"], {})).toThrow(/max-user/);
    expect(usage()).toContain("http://127.0.0.1:8787");
  });
});

// ---- The proxy against a fake upstream ----

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
type Reply = (req: http.IncomingMessage, res: http.ServerResponse, n: number) => void;
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}
function closeLater(server: http.Server) {
  closers.push(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }));
}

async function setup(reply: Reply, basePath = "/v1") {
  const seen: Seen[] = [];
  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      reply(req, res, seen.length);
    });
  });
  const upPort = await listen(upstream);
  closeLater(upstream);
  const logs: string[] = [];
  const guard = createGuardServer({ upstream: `http://127.0.0.1:${upPort}${basePath}`, ...LIMITS, log: (line: string) => logs.push(line) });
  const port = await listen(guard);
  closeLater(guard);
  return { seen, logs, port };
}

function send(port: number, method: string, path: string, headers: Record<string, string>, body?: string, onData?: (chunk: Buffer) => void) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => { chunks.push(c); onData?.(c); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const TOKEN = "Bearer sk-xingchi-SECRET-token-123";
const json = (status: number, payload: unknown): Reply => (_req, res) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
};
const LIMIT_ERROR = { error: { message: "This conversation has reached 100 model turns. Run /compact to continue.", type: "invalid_request_error", param: "session_turn_limit_exceeded" } };

describe("the proxy", () => {
  it("forwards method, path, Authorization and body, and writes the token and body nowhere", async () => {
    const { seen, logs, port } = await setup(json(200, { ok: true }));
    const body = JSON.stringify({ model: "m", messages: [user("PRIVATE-PROMPT-TEXT")] });
    const res = await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json", "x-extra": "kept" }, body);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", url: "/v1/chat/completions", body });
    expect(seen[0].headers.authorization).toBe(TOKEN);
    expect(seen[0].headers["x-extra"]).toBe("kept");
    expect(seen[0].headers.host).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(seen[0].headers["content-length"]).toBe(String(Buffer.byteLength(body)));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/POST \/v1\/chat\/completions 200 /);
    const allLogs = logs.join("\n");
    expect(allLogs).not.toContain("sk-xingchi");
    expect(allLogs).not.toContain("PRIVATE-PROMPT-TEXT");
  });

  it("adds the upstream base path for a client pointed at the bare guard, and passes a GET through", async () => {
    const { seen, port } = await setup(json(200, { data: [] }));
    const res = await send(port, "GET", "/models", { authorization: TOKEN });
    expect(res.status).toBe(200);
    expect(seen[0]).toMatchObject({ method: "GET", url: "/v1/models", body: "" });
  });

  it("compacts an over-limit request before forwarding and logs the counts", async () => {
    const { seen, logs, port } = await setup(json(200, { ok: true }));
    const body = JSON.stringify({ model: "m", messages: chatConversation(30) });
    await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json" }, body);
    const forwarded = JSON.parse(seen[0].body);
    expect(forwarded.messages.filter(isNote)).toHaveLength(1);
    expect(countTurns("chat", forwarded).user).toBeLessThanOrEqual(9);
    expect(seen[0].headers["content-length"]).toBe(String(Buffer.byteLength(seen[0].body)));
    expect(logs[0]).toMatch(/turns user=32 model=31 -> user=\d+ model=\d+ compacted=yes/);
  });

  it("passes a non-JSON body to a parsed path through byte for byte", async () => {
    const { seen, port } = await setup(json(200, { ok: true }));
    const body = "not json {{{";
    await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json" }, body);
    expect(seen[0].body).toBe(body);
  });

  it("streams an SSE response through byte for byte, before the upstream has finished", async () => {
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => { release = resolve; });
    const first = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n';
    const rest = 'data: {"choices":[{"delta":{"content":"lo \\u00e9"}}]}\n\ndata: [DONE]\n\n';
    const { port } = await setup((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(first);
      void released.then(() => res.end(rest));
    });
    const res = await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json" },
      JSON.stringify({ stream: true, messages: [user("hi")] }), () => release());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.body.equals(Buffer.from(first + rest))).toBe(true);
  });

  it("a 400 session_turn_limit_exceeded gets exactly one compacted retry, whose answer reaches the client", async () => {
    const { seen, logs, port } = await setup((req, res, n) => (n === 1 ? json(400, LIMIT_ERROR) : json(200, { ok: "retried" }))(req, res, n));
    const body = JSON.stringify({ model: "m", messages: chatConversation(12) });
    const res = await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json" }, body);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ ok: "retried" });
    expect(seen).toHaveLength(2);
    expect(seen[0].body).toBe(body);
    const retried = JSON.parse(seen[1].body);
    expect(retried.messages.filter(isNote)).toHaveLength(1);
    const after = countTurns("chat", retried);
    expect(after.user).toBeLessThanOrEqual(4);
    expect(after.model).toBeLessThanOrEqual(23);
    expect(seen[1].headers.authorization).toBe(TOKEN);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/200 .*compacted=yes.*retry/);
    expect(logs.join("\n")).not.toContain("sk-xingchi");
  });

  it("a second 400 passes through to the client, with no third attempt", async () => {
    const { seen, port } = await setup((req, res, n) => json(400, { ...LIMIT_ERROR, attempt: n })(req, res, n));
    const res = await send(port, "POST", "/v1/responses", { authorization: TOKEN, "content-type": "application/json" },
      JSON.stringify({ model: "m", input: responsesConversation(10) }));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body.toString())).toMatchObject({ attempt: 2, error: { param: "session_turn_limit_exceeded" } });
    expect(seen).toHaveLength(2);
  });

  it("any other 400 passes through untouched, with no retry", async () => {
    const { seen, port } = await setup(json(400, { error: { message: "bad model" } }));
    const res = await send(port, "POST", "/v1/chat/completions", { authorization: TOKEN, "content-type": "application/json" },
      JSON.stringify({ messages: chatConversation(12) }));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body.toString())).toEqual({ error: { message: "bad model" } });
    expect(seen).toHaveLength(1);
  });
});
