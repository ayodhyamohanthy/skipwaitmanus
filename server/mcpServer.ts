/**
 * Read-only MCP server (Streamable HTTP, stateless, JSON responses) for connected assistants.
 *
 * Hard limits, enforced here and not only in copy:
 * - Every tool is read-only. There is no tool that sends, accepts, passes, refers, spends or buys.
 * - A tool only ever reads the token owner's own data, or the public jobs catalog.
 * - Responses are whitelisted field by field. Nothing about referrers (names, emails, ids) or
 *   other people leaves this file.
 */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

export type McpContext = { userId: number };

export type McpDeps = {
  searchJobs: (input: { query?: string; company?: string }) => Promise<Array<Record<string, unknown>>>;
  listRequests: (userId: number) => Promise<Array<Record<string, unknown>>>;
  listAlerts: (userId: number) => Promise<Array<Record<string, unknown>>>;
};

type RpcId = string | number | null;
export type RpcResponse = { jsonrpc: "2.0"; id: RpcId; result?: unknown; error?: { code: number; message: string } } | null;

const MAX_RESULTS = 25;

export const MCP_TOOLS = [
  {
    name: "search_jobs",
    description: "Search the public SkipWait catalog of roles at companies open to referrals. Read-only.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words in the title, company or description" }, company: { type: "string", description: "Exact company name" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_my_requests",
    description: "List the signed-in member's own referral requests and their status. Read-only. Never includes referrer identities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_my_alerts",
    description: "List the signed-in member's own company-opening alerts. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
] as const;

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map(tool => tool.name);

const str = (value: unknown, max: number): string | null => (typeof value === "string" ? value.slice(0, max) : null);
const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return new Date(value).toISOString();
  return null;
};

/** Field whitelists. A new column added to a table never reaches an assistant by accident. */
export const shapeJob = (row: Record<string, unknown>) => ({
  id: typeof row.id === "number" ? row.id : null,
  title: str(row.title, 200), company: str(row.company, 200), location: str(row.location, 200),
  seniority: str(row.seniority, 80), compensation: str(row.compensation, 200),
});
export const shapeRequest = (row: Record<string, unknown>) => ({
  id: typeof row.id === "number" ? row.id : null,
  jobTitle: str(row.jobTitle, 200), company: str(row.company, 200), status: str(row.status, 40),
  createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});
export const shapeAlert = (row: Record<string, unknown>) => ({
  id: typeof row.id === "number" ? row.id : null,
  companyDomain: str(row.companyDomain, 255), paused: row.paused === true, notified: Boolean(row.notifiedAt), createdAt: iso(row.createdAt),
});

const textResult = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }], isError: false });
const toolError = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });

export async function callMcpTool(name: unknown, args: unknown, ctx: McpContext, deps: McpDeps) {
  const input = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  if (name === "search_jobs") {
    const query = typeof input.query === "string" ? input.query.trim().slice(0, 120) : undefined;
    const company = typeof input.company === "string" ? input.company.trim().slice(0, 120) : undefined;
    const rows = await deps.searchJobs({ query: query || undefined, company: company || undefined });
    return textResult({ jobs: rows.slice(0, MAX_RESULTS).map(shapeJob), truncated: rows.length > MAX_RESULTS });
  }
  if (name === "list_my_requests") {
    const rows = await deps.listRequests(ctx.userId);
    return textResult({ requests: rows.slice(0, MAX_RESULTS).map(shapeRequest), truncated: rows.length > MAX_RESULTS });
  }
  if (name === "list_my_alerts") {
    const rows = await deps.listAlerts(ctx.userId);
    return textResult({ alerts: rows.slice(0, MAX_RESULTS).map(shapeAlert), truncated: rows.length > MAX_RESULTS });
  }
  return toolError("Unknown tool. This server only offers read-only tools.");
}

const rpcError = (id: RpcId, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

/** One JSON-RPC message in, one response out (null for notifications). */
export async function handleMcpMessage(message: unknown, ctx: McpContext, deps: McpDeps): Promise<RpcResponse> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return rpcError(null, -32600, "Invalid request");
  const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown };
  const hasId = typeof id === "string" || typeof id === "number";
  if (typeof method !== "string") return rpcError(hasId ? (id as RpcId) : null, -32600, "Invalid request");
  if (!hasId) return null; // notifications (e.g. notifications/initialized) get no response
  const rpcId = id as RpcId;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id: rpcId, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "skipwait", version: "1.0.0" }, instructions: "Read-only access to your SkipWait account. Sending an ask or spending credits is not available here." } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id: rpcId, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id: rpcId, result: { tools: MCP_TOOLS } };
  if (method === "tools/call") {
    const p = params && typeof params === "object" ? (params as { name?: unknown; arguments?: unknown }) : {};
    try {
      return { jsonrpc: "2.0", id: rpcId, result: await callMcpTool(p.name, p.arguments, ctx, deps) };
    } catch {
      return { jsonrpc: "2.0", id: rpcId, result: toolError("We could not complete that. Try again in a moment.") };
    }
  }
  return rpcError(rpcId, -32601, "Method not found");
}
