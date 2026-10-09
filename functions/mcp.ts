// Pages Function: the public MCP address skipwait.me/mcp is an alias of /api/mcp.
// It reuses the exact /api/* proxy so both paths reach the API the same way.
import { onRequest as proxyApi } from "./api/[[path]]";

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = async (context) => {
  const url = new URL(context.request.url);
  url.pathname = "/api/mcp";
  const request = new Request(url.toString(), context.request);
  return proxyApi({ ...context, request } as Parameters<typeof proxyApi>[0]);
};
