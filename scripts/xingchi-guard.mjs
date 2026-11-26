#!/usr/bin/env node
// XINGCHI-turn-guard (D-403): a local proxy in front of the Xingchi relay that compacts each conversation before the
// relay's per-request turn limits (20 user turns, 100 model replies), so no agent client stops on
// `session_turn_limit_exceeded`.
//
//   node scripts/xingchi-guard.mjs --upstream https://<xingchi-host>/v1        # listens on http://127.0.0.1:8787
//   XINGCHI_BASE_URL=https://<xingchi-host>/v1 node scripts/xingchi-guard.mjs --port 8787 --max-user 18 --max-model 95
//
// Point the client's base URL at http://127.0.0.1:8787 plus the same path suffix it used with Xingchi (for
// https://<xingchi-host>/v1, use http://127.0.0.1:8787/v1). Node built-ins only. It listens on 127.0.0.1 only, passes
// the Authorization header through untouched and never logs or stores it, request bodies or responses. One line per
// request goes to stderr: time, method, path (no query), status, turns before and after, compacted yes/no.
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

export const DEFAULTS = Object.freeze({ port: 8787, maxUser: 18, maxModel: 95 });
export const COMPACT_NOTE_START = "[Earlier conversation compacted by xingchi-guard: ";
export const COMPACT_NOTE_END = " turns removed to stay under the provider's turn limit. Re-read your task packet, the picker output and git log for anything you need.]";
export const TURN_LIMIT_MARKER = "session_turn_limit_exceeded";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
const SYSTEM_ROLES = new Set(["system", "developer"]);
const INPUT_ITEM_TYPES = new Set(["message", "item_reference", "mcp_approval_response"]);

export function compactNote(removed) {
  return `${COMPACT_NOTE_START}${removed}${COMPACT_NOTE_END}`;
}

/** "chat" for POST .../chat/completions, "responses" for POST .../responses, otherwise null (passed through). */
export function requestKind(method, rawPath) {
  if (method !== "POST") return null;
  const pathname = String(rawPath).split("?")[0].replace(/\/+$/, "");
  if (pathname.endsWith("/chat/completions")) return "chat";
  if (pathname.endsWith("/responses")) return "responses";
  return null;
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const listOf = (kind, body) => {
  if (!isObject(body)) return null;
  const list = kind === "chat" ? body.messages : body.input;
  return Array.isArray(list) ? list : null;
};
const roleOf = (item) => (isObject(item) && typeof item.role === "string" ? item.role : null);
const isSystem = (item) => SYSTEM_ROLES.has(roleOf(item));
const isUser = (item) => roleOf(item) === "user";

// A responses item the model produced: an assistant message, or a role-less item such as reasoning, function_call or
// another *_call. Tool results (*_output), references and approvals are inputs.
function isModelOutput(item) {
  const role = roleOf(item);
  if (role) return role === "assistant";
  if (!isObject(item) || typeof item.type !== "string") return false;
  return !INPUT_ITEM_TYPES.has(item.type) && !item.type.endsWith("_output");
}

/**
 * Counts user turns and model replies the way Xingchi's error text describes them.
 * chat: every role "user" message is a user turn, every role "assistant" message a model reply (tool results neither).
 * responses: every role "user" message is a user turn; each unbroken run of model output items (assistant messages,
 * reasoning, function_call and other *_call items) is one model reply, as one model response emits them.
 */
export function countTurns(kind, body) {
  const list = listOf(kind, body);
  const counts = { user: 0, model: 0 };
  if (!list) return counts;
  let inRun = false;
  for (const item of list) {
    if (isUser(item)) counts.user++;
    if (kind === "chat") {
      if (roleOf(item) === "assistant") counts.model++;
      continue;
    }
    const model = isModelOutput(item);
    if (model && !inRun) counts.model++;
    inRun = model;
  }
  return counts;
}

// Index pairs that must be kept or dropped together: a tool call and its result.
function pairsOf(kind, list) {
  const calls = new Map();
  const pairs = [];
  list.forEach((item, index) => {
    if (!isObject(item)) return;
    if (kind === "chat") {
      if (Array.isArray(item.tool_calls)) for (const call of item.tool_calls) if (isObject(call) && call.id != null) calls.set(String(call.id), index);
      if (item.role === "tool" && item.tool_call_id != null && calls.has(String(item.tool_call_id))) pairs.push([calls.get(String(item.tool_call_id)), index]);
      return;
    }
    if (item.call_id == null || typeof item.type !== "string") return;
    if (item.type.endsWith("_output")) {
      if (calls.has(String(item.call_id))) pairs.push([calls.get(String(item.call_id)), index]);
    } else calls.set(String(item.call_id), index);
  });
  return pairs;
}

// May the kept tail start at index k? Never on a tool result, never right after a reasoning item, and never so that a
// call and its result fall on different sides of the cut.
function cutAllowed(kind, list, k, kept, pairs) {
  const item = list[k];
  if (kind === "chat" && roleOf(item) === "tool") return false;
  if (kind === "responses" && isObject(item) && typeof item.type === "string" && item.type.endsWith("_output")) return false;
  const before = list[k - 1];
  if (kind === "responses" && isObject(before) && before.type === "reasoning") return false;
  return pairs.every(([a, b]) => kept(a) === kept(b));
}

function noteItem(kind, text) {
  if (kind === "chat") return { role: "user", content: text };
  return { type: "message", role: "user", content: [{ type: "input_text", text }] };
}

/**
 * Compacts a chat/completions or responses body when either count reaches its limit (or always, with force).
 * Keeps every system/developer message, everything up to the first user message and the most recent tail, chosen as
 * long as it fits about half the limits (at least the first user message, the note and one more user turn), cut only
 * at safe boundaries, and puts one note where the dropped middle was. Returns the input body itself when nothing
 * changes. `removed` is the number of user turns and model replies dropped.
 */
export function compactBody(kind, body, limits, { force = false } = {}) {
  const before = countTurns(kind, body);
  const unchanged = { body, compacted: false, before, after: before, removed: 0 };
  const list = listOf(kind, body);
  if (!list) return unchanged;
  if (!force && before.user < limits.maxUser && before.model < limits.maxModel) return unchanged;
  const target = { user: Math.max(3, Math.floor(limits.maxUser / 2)), model: Math.max(1, Math.floor(limits.maxModel / 2)) };
  const firstUser = list.findIndex(isUser);
  if (firstUser < 0) return unchanged;
  const pairs = pairsOf(kind, list);
  const build = (k) => {
    const middle = list.slice(firstUser + 1, k);
    const dropped = middle.filter((item) => !isSystem(item));
    const lost = countTurns(kind, kind === "chat" ? { messages: dropped } : { input: dropped });
    const removed = lost.user + lost.model;
    const out = [...list.slice(0, firstUser + 1), ...middle.filter(isSystem), noteItem(kind, compactNote(removed)), ...list.slice(k)];
    return { out, removed };
  };
  let best = null;
  for (let k = firstUser + 2; k < list.length; k++) {
    const kept = (i) => i <= firstUser || i >= k || isSystem(list[i]);
    if (!cutAllowed(kind, list, k, kept, pairs)) continue;
    const candidate = { k, ...build(k) };
    const counts = countTurns(kind, kind === "chat" ? { messages: candidate.out } : { input: candidate.out });
    best = { ...candidate, counts };
    if (counts.user <= target.user && counts.model <= target.model) break;
  }
  if (!best) return unchanged;
  const next = kind === "chat" ? { ...body, messages: best.out } : { ...body, input: best.out };
  return { body: next, compacted: true, before, after: best.counts, removed: best.removed };
}

/** The limits for the one retry after the relay refused: a quarter of the configured limits, and below this body. */
export function retryLimits(limits, before) {
  return {
    maxUser: Math.min(Math.floor(limits.maxUser / 2), before.user),
    maxModel: Math.min(Math.floor(limits.maxModel / 2), before.model),
  };
}

export function isTurnLimitError(status, text) {
  return status === 400 && typeof text === "string" && text.includes(TURN_LIMIT_MARKER);
}

/** The upstream path: the client's path, with the upstream base path added unless the client already sent it. */
export function upstreamPath(basePath, requestPath) {
  const base = basePath.replace(/\/+$/, "");
  if (!base) return requestPath;
  const [pathname] = requestPath.split("?");
  if (pathname === base || pathname.startsWith(`${base}/`)) return requestPath;
  return `${base}${requestPath}`;
}

export function usage() {
  return `xingchi-guard (D-403): compacts conversations before Xingchi's turn limits and retries once on ${TURN_LIMIT_MARKER}.

Usage: node scripts/xingchi-guard.mjs --upstream <Xingchi base URL> [--port ${DEFAULTS.port}] [--max-user ${DEFAULTS.maxUser}] [--max-model ${DEFAULTS.maxModel}]

  --upstream URL   Xingchi base URL, as configured in your client (or set XINGCHI_BASE_URL). Required.
  --port N         Local port on 127.0.0.1 (default ${DEFAULTS.port}).
  --max-user N     Compact when a request holds N user turns (default ${DEFAULTS.maxUser}; Xingchi stops at 20).
  --max-model N    Compact when a request holds N model replies (default ${DEFAULTS.maxModel}; Xingchi stops at 100).
  --help           Show this text.

Point the client's base URL at http://127.0.0.1:${DEFAULTS.port} plus the same path suffix you used with Xingchi:
for --upstream https://<host>/v1, use http://127.0.0.1:${DEFAULTS.port}/v1. A request path that already starts with the
upstream base path is forwarded as is; any other path gets the base path in front. The API key stays in the client and
reaches Xingchi in the Authorization header; the guard never logs or stores it, nor any request or response body.
`;
}

const positiveInt = (flag, value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a positive whole number, got "${value}"`);
  return n;
};

export function parseArgs(argv, env = process.env) {
  const options = { ...DEFAULTS, upstream: env.XINGCHI_BASE_URL || "", help: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") return { ...options, help: true };
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    i++;
    if (flag === "--upstream") options.upstream = value;
    else if (flag === "--port") options.port = positiveInt("--port", value);
    else if (flag === "--max-user") options.maxUser = positiveInt("--max-user", value);
    else if (flag === "--max-model") options.maxModel = positiveInt("--max-model", value);
    else throw new Error(`unknown flag ${flag}`);
  }
  let url;
  try { url = new URL(options.upstream); } catch { url = null; }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("--upstream (or XINGCHI_BASE_URL) must be the http(s) Xingchi base URL");
  }
  return options;
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function decodeText(buffer, encoding) {
  try {
    const enc = String(encoding || "").trim().toLowerCase();
    if (enc === "gzip" || enc === "x-gzip") return zlib.gunzipSync(buffer).toString("utf8");
    if (enc === "br") return zlib.brotliDecompressSync(buffer).toString("utf8");
    if (enc === "deflate") return zlib.inflateSync(buffer).toString("utf8");
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

// Response headers in raw [name, value, ...] form, without hop-by-hop ones, so repeated headers survive.
function responseHeaders(rawHeaders) {
  const out = [];
  for (let i = 0; i < rawHeaders.length; i += 2) if (!HOP_BY_HOP.has(rawHeaders[i].toLowerCase())) out.push(rawHeaders[i], rawHeaders[i + 1]);
  return out;
}

const fmt = (counts) => (counts ? `user=${counts.user} model=${counts.model}` : "-");

/** The proxy server (not yet listening). `log` receives one line per request; tests inject it. */
export function createGuardServer({ upstream, maxUser = DEFAULTS.maxUser, maxModel = DEFAULTS.maxModel, log = (line) => process.stderr.write(`${line}\n`) }) {
  const target = new URL(upstream);
  const client = target.protocol === "https:" ? https : http;
  const limits = { maxUser, maxModel };

  const forward = (req, path, body, signal) => new Promise((resolve, reject) => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name) && name !== "host" && name !== "content-length" && value !== undefined) headers[name] = value;
    }
    headers.host = target.host;
    if (body.length > 0 || !["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method)) headers["content-length"] = String(body.length);
    const outgoing = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path, headers }, resolve);
    outgoing.on("error", reject);
    signal.onAbort = () => outgoing.destroy();
    outgoing.end(body);
  });

  return http.createServer(async (req, res) => {
    const started = new Date().toISOString();
    const pathname = (req.url || "/").split("?")[0];
    const path = upstreamPath(target.pathname, req.url || "/");
    const kind = requestKind(req.method, req.url || "/");
    const signal = { onAbort: () => {} };
    res.on("close", () => { if (!res.writableFinished) signal.onAbort(); });
    let turns = { before: null, after: null, compacted: false, retried: false };
    const done = (status) => log(`${started} ${req.method} ${pathname} ${status} turns ${fmt(turns.before)} -> ${fmt(turns.after)} compacted=${turns.compacted ? "yes" : "no"}${turns.retried ? " retry=1" : ""}`);
    try {
      const raw = await readAll(req);
      let parsed = null;
      if (kind) { try { parsed = JSON.parse(raw.toString("utf8")); } catch { parsed = null; } }
      let body = raw;
      if (kind && listOf(kind, parsed)) {
        const result = compactBody(kind, parsed, limits);
        turns = { ...turns, before: result.before, after: result.after, compacted: result.compacted };
        if (result.compacted) body = Buffer.from(JSON.stringify(result.body));
      }
      let upstreamRes = await forward(req, path, body, signal);
      if (kind && turns.before && upstreamRes.statusCode === 400) {
        const errorBody = await readAll(upstreamRes);
        const text = decodeText(errorBody, upstreamRes.headers["content-encoding"]);
        const retry = isTurnLimitError(400, text) ? compactBody(kind, parsed, retryLimits(limits, turns.before), { force: true }) : null;
        if (!retry || !retry.compacted) {
          res.writeHead(400, responseHeaders(upstreamRes.rawHeaders));
          res.end(errorBody);
          done(400);
          return;
        }
        turns = { ...turns, after: retry.after, compacted: true, retried: true };
        upstreamRes = await forward(req, path, Buffer.from(JSON.stringify(retry.body)), signal);
      }
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders(upstreamRes.rawHeaders));
      upstreamRes.pipe(res);
      upstreamRes.on("end", () => done(upstreamRes.statusCode));
      upstreamRes.on("error", () => { res.destroy(); done(`${upstreamRes.statusCode}-aborted`); });
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { type: "xingchi_guard_upstream_error", message: `xingchi-guard could not reach the upstream (${error?.code || "error"})` } }));
      } else res.destroy();
      done(502);
    }
  });
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const server = createGuardServer(options);
  server.on("error", (error) => {
    process.stderr.write(`xingchi-guard: ${error.message}\n`);
    process.exit(1);
  });
  server.listen(options.port, "127.0.0.1", () => {
    const origin = new URL(options.upstream).origin;
    process.stderr.write(`xingchi-guard listening on http://127.0.0.1:${options.port} -> ${origin} (limits: ${options.maxUser} user turns, ${options.maxModel} model replies)\n`);
  });
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exitCode = code;
}
