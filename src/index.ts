#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Meilisearch } from "meilisearch";
import { z } from "zod";
import cors from "cors";
import express from "express";

// Create MeiliSearch client from environment variables
const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_SEARCH_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

const client = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

// Function to create a new MCP server instance with tools
function createServer(): McpServer {
  const srv = new McpServer({
    name: "meilisearch-mcp-server",
    version: "1.0.0",
  });

  // Register search tool
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
      const index = client.index(MEILI_INDEX_NAME);
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

// Set up Express
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Add this MCP server to your agent so they can search in our docs!');
});

// MCP HTTP endpoint using StreamableHTTPServerTransport (stateless)
app.post('/', async (req, res) => {
  try {
    // Create a new stateless transport for each request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // set to undefined for stateless servers
      enableJsonResponse: true,
    });

    // Create a new server instance for this transport and connect it
    const serverInstance = createServer();
    await serverInstance.connect(transport);

    // Handle the request with the transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
  console.log(`POST MCP requests to http://localhost:${PORT}/mcp`);
});
