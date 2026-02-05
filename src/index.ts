#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Meilisearch } from "meilisearch";
import { z } from "zod";

// Create MeiliSearch client from environment variables
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";

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
    const index = client.index(args.indexUid);
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

server.registerTool(
  "hybrid_search",
  {
    title: "Hybrid Search",
    description: "Combines keyword search with semantic/vector search using embeddings. Use semanticRatio to control the balance: 0 = pure keyword, 1 = pure semantic",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index to search"),
      query: z.string().describe("The search query string"),
      embedder: z.string().describe("Name of the embedder configured in MeiliSearch"),
      semanticRatio: z.number().min(0).max(1).optional().describe("Balance between keyword (0) and semantic (1) search. Default: 0.5"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
      offset: z.number().optional().describe("Number of results to skip (default: 0)"),
      filter: z.string().optional().describe("Filter expression"),
      attributesToRetrieve: z.array(z.string()).optional().describe("Attributes to include in results"),
      showRankingScore: z.boolean().optional().describe("Show the ranking score for each result"),
    },
  },
  async (args) => {
    const index = client.index(args.indexUid);
    const results = await index.search(args.query, {
      limit: args.limit,
      offset: args.offset,
      filter: args.filter,
      attributesToRetrieve: args.attributesToRetrieve,
      showRankingScore: args.showRankingScore,
      hybrid: {
        embedder: args.embedder,
        semanticRatio: args.semanticRatio,
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  "vector_search",
  {
    title: "Vector Search",
    description: "Search using a vector directly. Useful when you have pre-computed embeddings",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index to search"),
      vector: z.array(z.number()).describe("The vector/embedding to search with"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
      offset: z.number().optional().describe("Number of results to skip (default: 0)"),
      filter: z.string().optional().describe("Filter expression"),
      attributesToRetrieve: z.array(z.string()).optional().describe("Attributes to include in results"),
      showRankingScore: z.boolean().optional().describe("Show the ranking score for each result"),
    },
  },
  async (args) => {
    const index = client.index(args.indexUid);
    const results = await index.search("", {
      vector: args.vector,
      limit: args.limit,
      offset: args.offset,
      filter: args.filter,
      attributesToRetrieve: args.attributesToRetrieve,
      showRankingScore: args.showRankingScore,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  "similar_documents",
  {
    title: "Find Similar Documents",
    description: "Find documents similar to a given document using vector similarity",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index"),
      documentId: z.string().describe("The ID of the document to find similar documents for"),
      embedder: z.string().optional().describe("Name of the embedder to use (if multiple are configured)"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
      offset: z.number().optional().describe("Number of results to skip (default: 0)"),
      filter: z.string().optional().describe("Filter expression to narrow results"),
      attributesToRetrieve: z.array(z.string()).optional().describe("Attributes to include in results"),
      showRankingScore: z.boolean().optional().describe("Show the similarity score for each result"),
    },
  },
  async (args) => {
    const index = client.index(args.indexUid);
    const results = await index.searchSimilarDocuments({
      id: args.documentId,
      embedder: args.embedder,
      limit: args.limit,
      offset: args.offset,
      filter: args.filter,
      attributesToRetrieve: args.attributesToRetrieve,
      showRankingScore: args.showRankingScore,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  "multi_search",
  {
    title: "Multi-Index Search",
    description: "Perform searches across multiple indexes in a single request",
    inputSchema: {
      queries: z.array(z.object({
        indexUid: z.string().describe("The index to search"),
        q: z.string().optional().describe("Search query"),
        limit: z.number().optional().describe("Maximum results"),
        offset: z.number().optional().describe("Results to skip"),
        filter: z.string().optional().describe("Filter expression"),
      })).describe("Array of search queries for different indexes"),
    },
  },
  async (args) => {
    const results = await client.multiSearch({ queries: args.queries });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// ============================================
// READ-ONLY INDEX INFO
// ============================================

server.registerTool(
  "list_indexes",
  {
    title: "List Indexes",
    description: "List all available indexes in the MeiliSearch instance",
    inputSchema: {
      limit: z.number().optional().describe("Maximum number of indexes to return"),
      offset: z.number().optional().describe("Number of indexes to skip"),
    },
  },
  async (args) => {
    const indexes = await client.getIndexes({ limit: args.limit, offset: args.offset });
    return {
      content: [{ type: "text", text: JSON.stringify(indexes, null, 2) }],
    };
  }
);

server.registerTool(
  "get_index",
  {
    title: "Get Index Info",
    description: "Get information about a specific index including its settings",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index"),
    },
  },
  async (args) => {
    const index = await client.getIndex(args.indexUid);
    const settings = await index.getSettings();
    return {
      content: [{ type: "text", text: JSON.stringify({ index, settings }, null, 2) }],
    };
  }
);

// ============================================
// READ-ONLY DOCUMENT ACCESS
// ============================================

server.registerTool(
  "get_documents",
  {
    title: "Get Documents",
    description: "Retrieve documents from an index",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index"),
      limit: z.number().optional().describe("Maximum number of documents to return (default: 20)"),
      offset: z.number().optional().describe("Number of documents to skip"),
      fields: z.array(z.string()).optional().describe("Fields to include in the response"),
    },
  },
  async (args) => {
    const index = client.index(args.indexUid);
    const documents = await index.getDocuments({
      limit: args.limit,
      offset: args.offset,
      fields: args.fields as string[],
    });
    return {
      content: [{ type: "text", text: JSON.stringify(documents, null, 2) }],
    };
  }
);

server.registerTool(
  "get_document",
  {
    title: "Get Document",
    description: "Retrieve a single document by its ID",
    inputSchema: {
      indexUid: z.string().describe("The unique identifier of the index"),
      documentId: z.string().describe("The document's primary key value"),
      fields: z.array(z.string()).optional().describe("Fields to include in the response"),
    },
  },
  async (args) => {
    const index = client.index(args.indexUid);
    const document = await index.getDocument(args.documentId, { fields: args.fields as string[] });
    return {
      content: [{ type: "text", text: JSON.stringify(document, null, 2) }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MeiliSearch MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
