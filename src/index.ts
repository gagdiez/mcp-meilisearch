#!/usr/bin/env node

import "dotenv/config";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./mcp.js";
import { chatHandler } from "./chat.js";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("Add this MCP server to your agent so they can search in our docs!");
});

// MCP HTTP endpoint (stateless)
app.post("/", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const serverInstance = createServer();
    await serverInstance.connect(transport);

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
      });
    }
  }
});

// Chat endpoint
app.post("/api/chat", chatHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
  console.log(`POST MCP requests to http://localhost:${PORT}/mcp`);
  console.log(`Chat API available at http://localhost:${PORT}/api/chat`);
});
