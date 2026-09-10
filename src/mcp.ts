// One question to Fleet's MCP server (`fleet mcp --stdio`), then hang up.
//
// Every tool is a thin wrapper over a public Fleet API, so the extension
// never re-implements DAG traversal or conformance checks. Never import
// `vscode`: this runs under `node --test` against test/support/mcp-server.ts.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { ServerCommand } from "./server.ts";

/**
 * Call *tool* and return its structured result, or its parsed text when the
 * server sends none. Throws with Fleet's own message when the tool fails,
 * and names the missing tool when the installed Fleet does not have it.
 */
export async function callTool(
  server: ServerCommand,
  cwd: string,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd,
    stderr: "pipe",
  });
  const client = new Client({ name: "fleet-vscode", version: "0.1.0" });
  const options = { signal, timeout: 120_000 };
  // connect() spawns synchronously, so the listener is in place before any output.
  const connecting = client.connect(transport, options);
  const stderr: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  try {
    await connecting;
    const { tools } = await client.listTools(undefined, options);
    if (!tools.some((entry) => entry.name === tool))
      throw new Error(`Installed Fleet does not provide ${tool}. Update Fleet with the mcp extra.`);
    const result = await client.callTool({ name: tool, arguments: args }, undefined, options);
    const content: unknown = result.content;
    const text = (Array.isArray(content) ? content : [])
      .flatMap((block: unknown) => (isText(block) ? [block.text] : []))
      .join("\n");
    if (result.isError) throw new Error(text || `${tool} failed.`);
    const structured = result.structuredContent;
    // ponytail: FastMCP wraps scalar/list returns as {result: …}; dicts come as-is.
    if (structured && typeof structured === "object")
      return "result" in structured ? structured.result : structured;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error) {
    // The server died: its last words explain why far better than "Connection closed".
    const said = stderr.join("").trim().split("\n").at(-1)?.trim();
    if (said && error instanceof Error && /connection closed/i.test(error.message))
      throw new Error(said.replace(/^Error:\s*/, ""), { cause: error });
    throw error;
  } finally {
    await client.close();
  }
}

/** Narrow a tool result to the list of names most DAG tools return. */
export function names(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error("Fleet returned an unexpected result shape.");
  return value;
}

function isText(block: unknown): block is { type: "text"; text: string } {
  return (
    !!block &&
    typeof block === "object" &&
    "type" in block &&
    block.type === "text" &&
    "text" in block &&
    typeof block.text === "string"
  );
}
