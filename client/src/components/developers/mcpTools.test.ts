import { describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES } from "../../../../server/mcpServer";
import { DOCUMENTED_MCP_TOOLS } from "./mcpTools";

describe("documented MCP tools", () => {
  it("lists exactly the tools the live MCP endpoint exposes, in the same order", () => {
    expect(DOCUMENTED_MCP_TOOLS.map(([name]) => name)).toEqual([...MCP_TOOL_NAMES]);
  });

  it("gives every tool a plain description", () => {
    for (const [, description] of DOCUMENTED_MCP_TOOLS) expect(description.trim().length).toBeGreaterThan(10);
  });
});
