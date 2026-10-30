/**
 * privatesearch MCP server. Tools: search, fetch_content.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set. Tool names,
 * parameters, and required sets are taken from the public spec.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { fetchContent, searchWeb, VERSION } from "./search.js";
import type { FetchFn } from "./types.js";

const SearchArgs = z.object({
  query: z.string(),
  max_results: z.number().int().optional(),
  region: z.string().optional(),
});

const FetchContentArgs = z.object({
  url: z.string(),
});

const TOOLS = [
  {
    name: "search",
    description: "Search the web with DuckDuckGo and return result titles, URLs, and snippets.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query text to submit to DuckDuckGo." },
        max_results: { type: "integer", description: "Maximum number of search results to return." },
        region: { type: "string", description: "Region code used to localize the search results." },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_content",
    description: "Fetch a web page and return its readable text content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL of the web page to fetch." },
      },
      required: ["url"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "privatesearch", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  try {
    if (name === "search") {
      const parsed = SearchArgs.parse(args ?? {});
      return textResult(
        await searchWeb(fetchFn, {
          query: parsed.query,
          max_results: parsed.max_results,
          region: parsed.region,
        }),
      );
    }
    if (name === "fetch_content") {
      const parsed = FetchContentArgs.parse(args ?? {});
      const result = await fetchContent(fetchFn, parsed.url);
      return textResult(result.text);
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
