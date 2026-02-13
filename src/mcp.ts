import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { meiliClient } from "./searchClient.js";

const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

export function createServer(): McpServer {
  const srv = new McpServer({
    name: "meilisearch-mcp-server",
    version: "1.0.0",
  });

  const searchSchema = z.object({
    query: z.string().describe("The search query string"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
    offset: z.number().optional().describe("Number of results to skip (default: 0)"),
  });

  srv.registerTool(
    "search",
    {
      title: "Search Documents",
      description: "Full-text keyword search in a MeiliSearch index",
      inputSchema: searchSchema,
    },
    async (args: z.infer<typeof searchSchema>) => {
      console.log(`Received search request with query: ${args.query}`);
      const index = meiliClient.index(MEILI_INDEX_NAME);
      const results = await index.search(args.query, {
        hybrid: { semanticRatio: 0.7, embedder: "default" },
        limit: args.limit,
        offset: args.offset,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  return srv;
}
