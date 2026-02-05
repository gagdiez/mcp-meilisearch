#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Meilisearch } from "meilisearch";
import { z } from "zod";
import cors from "cors";

// Create MeiliSearch client from environment variables
const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_SEARCH_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

const client = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
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
      query: z.string().describe("The search query string"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
      offset: z.number().optional().describe("Number of results to skip (default: 0)"),
    },
  },
  async (args) => {
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
    allowedHeaders: "Authorization, Origin, Content-Type, Accept, *",
  })
);

app.post('/', async (req, res) => {
  try {
    await statelessTransport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.post('/mcp', async (req, res) => {
  try {
    await statelessTransport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/', (req, res) => {
  res.send('Add this MCP server as a tool in your agent to allow it to search in our Docs!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP server is running on port ${PORT}`);
  console.log(`Access at: https://docs.near.org/mcp`);
});
