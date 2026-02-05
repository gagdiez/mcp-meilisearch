#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Meilisearch } from "meilisearch";
import { z } from "zod";
import cors from "cors";

// Create MeiliSearch client from environment variables
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

const client = new Meilisearch({
  host: MEILISEARCH_HOST,
  apiKey: MEILISEARCH_API_KEY,
});

// Create MCP server
const server = new McpServer({
  name: "meilisearch-mcp-server",
  version: "1.0.0",
});

// ============================================
// SEARCH TOOLS
// ============================================

server.registerTool(
  "search",
  {
    title: "Search Documents",
    description: "Full-text keyword search in a MeiliSearch index",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index to search"),
      query: z.string().describe("The search query string"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
      offset: z.number().optional().describe("Number of results to skip (default: 0)"),
      filter: z.string().optional().describe("Filter expression (e.g., 'genre = horror AND director = Jordan')"),
      sort: z.array(z.string()).optional().describe("Array of sort rules (e.g., ['price:asc', 'title:desc'])"),
      attributesToRetrieve: z.array(z.string()).optional().describe("Attributes to include in results"),
      attributesToHighlight: z.array(z.string()).optional().describe("Attributes to highlight in results"),
    },
  },
  async (args) => {
    const index = client.index(MEILI_INDEX_NAME);
    const results = await index.search(args.query, {
      limit: args.limit,
      offset: args.offset,
      filter: args.filter,
      sort: args.sort,
      attributesToRetrieve: args.attributesToRetrieve,
      attributesToHighlight: args.attributesToHighlight,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);
  
// Stateless mode - explicitly set session ID to undefined
const statelessTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

await server.connect(statelessTransport);

// Set up Express server to handle MCP requests
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: true, // Allow any origin for public server
    methods: ['GET', 'POST'],
    allowedHeaders: 'Authorization, Origin, Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version',
  })
);

app.post('/', (req, res) => {
  statelessTransport.handleRequest(req, res, req.body);
});

app.get('/', (req, res) => {
  res.send('Add this MCP server as a tool in your agent to allow it to search in our Docs!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP server is running on port ${PORT}`);
  console.log(`Access at: https://docs.near.org/mcp`);
});
