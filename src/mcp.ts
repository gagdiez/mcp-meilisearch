import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Meilisearch } from "meilisearch";
import { z } from "zod";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";


const meiliClient = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

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
