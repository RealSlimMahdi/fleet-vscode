// A stand-in for `fleet mcp --stdio`, speaking real MCP over stdio so the
// client is tested against the protocol rather than a mock.

import process from "node:process";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const NAMES = ["dm_raw", "DM", "ADSL"];
const CHECK = { dataset: "DM", is_valid: false, missing_columns: ["AGE"] };

const server = new Server({ name: "fleet-test", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: process.argv.includes("missing")
    ? []
    : ["fleet_execution_order", "fleet_impacted_by", "fleet_dataset_check"].map((name) => ({
        name,
        inputSchema: { type: "object" as const },
      })),
}));
server.setRequestHandler(CallToolRequestSchema, (request) => {
  const node = request.params.arguments?.node;
  if (request.params.name === "fleet_dataset_check")
    return { content: [{ type: "text", text: JSON.stringify(CHECK) }], structuredContent: CHECK };
  if (node === "invalid")
    return { isError: true, content: [{ type: "text", text: "Missing input: source" }] };
  if (node === "malformed") return { content: [{ type: "text", text: "{}" }] };
  if (node === "wait") return new Promise(() => {});
  if (node === "json") return { content: [{ type: "text", text: JSON.stringify(NAMES) }] };
  if (node === "legacy") return { content: [{ type: "text", text: "DM" }] };
  return {
    content: NAMES.map((text) => ({ type: "text", text })),
    structuredContent: { result: NAMES },
  };
});
void server.connect(new StdioServerTransport()).catch(() => {
  process.exitCode = 1;
});
