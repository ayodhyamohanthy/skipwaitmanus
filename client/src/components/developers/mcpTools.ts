// The tools the live MCP endpoint (server/mcpServer.ts MCP_TOOLS) exposes, in
// docs wording for /developers. mcpTools.test.ts fails if this list drifts
// from the server, so the page never documents a tool that does not exist.
export const MCP_ENDPOINT = "https://skipwait.me/api/mcp";

export const DOCUMENTED_MCP_TOOLS: ReadonlyArray<readonly [name: string, description: string]> = [
  ["search_jobs", "Roles at companies open to referrals, by words or company"],
  ["list_my_requests", "Your open and closed requests"],
  ["list_my_alerts", "Your company alerts"],
  ["list_my_resumes", "Your uploaded resumes, to attach to an ask"],
  ["propose_ask", "Create a draft ask — never sends. You approve it in SkipWait, where the credit cost is shown"],
];
