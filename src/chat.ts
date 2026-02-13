import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

interface ThreadData {
  messages: Array<Anthropic.MessageParam>;
  lastAccess: number;
}

const threads = new Map<string, ThreadData>();
const MAX_HISTORY_MESSAGES = 4;
const THREAD_TTL_MS = 30 * 60 * 1000;

function cleanExpiredThreads() {
  const now = Date.now();
  for (const [key, thread] of threads) {
    if (now - thread.lastAccess > THREAD_TTL_MS) {
      threads.delete(key);
    }
  }
}

setInterval(cleanExpiredThreads, 5 * 60 * 1000);

const SYSTEM_PROMPT = `You are an expert assistant for NEAR Protocol documentation.
Your role is to help developers understand and build on NEAR Protocol based on the official documentation.

You have access to a search tool that lets you query the NEAR documentation. Use it to find relevant information before answering questions.

## Response guidelines
- Always search the documentation before answering technical questions
- Answer questions based ONLY on the documentation results. Do not invent or assume information
- If the documentation doesn't cover the topic, say so clearly and suggest related topics that might help
- Always answer in the same language the user writes in

## Code examples
- Include working code examples when relevant, using the latest NEAR SDK patterns
- Specify the language/SDK (e.g. near-api-js, near-sdk-rs, near-sdk-js) when showing code
- Add brief inline comments to explain non-obvious parts

## Formatting
- Use Markdown: headings, code blocks with syntax highlighting, bullet points, and bold for key terms
- When referencing documentation, mention the section name and path
- Keep answers concise but complete — prefer short paragraphs over walls of text
- Use step-by-step instructions for multi-part processes

## Scope
- If the question is unrelated to NEAR Protocol, politely redirect the user
- For ambiguous questions, ask for clarification before answering`;

function collectSources(
  content: any[],
  sources: Array<{ title: string; path: string }>
) {
  for (const block of content) {
    if (block.type === "mcp_tool_result" && !block.is_error) {
      try {
        let raw: string;
        if (typeof block.content === "string") {
          raw = block.content;
        } else if (Array.isArray(block.content)) {
          raw = block.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("");
        } else {
          continue;
        }
        
        const parsed = JSON.parse(raw);
        if (parsed.hits) {
          for (const hit of parsed.hits.slice(0, 3)) {
            if (hit.title || hit.path) {
              sources.push({ title: hit.title || "Untitled", path: hit.path || "" });
            }
          }
        }
      } catch {
      }
    }
  }
}

export async function chatHandler(req: Request, res: Response) {
  try {
    const { messages: userMessage, threadId } = req.body;

    if (!userMessage) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    let conversationHistory: Array<Anthropic.MessageParam> = [];
    if (threadId && threads.has(threadId)) {
      const thread = threads.get(threadId)!;
      thread.lastAccess = Date.now();
      conversationHistory = thread.messages;
    }

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.slice(-4),
      { role: "user", content: userMessage },
    ];

    const mcpConfig = {
      model: "claude-sonnet-4-5-20250929",
      betas: ["mcp-client-2025-11-20"],
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      mcp_servers: [
        {
          type: "url",
          url: MCP_SERVER_URL,
          name: "near-docs",
        },
      ],
      tools: [
        {
          type: "mcp_toolset",
          mcp_server_name: "near-docs",
          cache_control: { type: "ephemeral" },
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    };

    const sources: Array<{ title: string; path: string }> = [];
    const MAX_ITERATIONS = 5;

    let response = await (anthropic as any).beta.messages.create({
      ...mcpConfig,
      messages,
    });

    console.log({
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens || 0,
      cache_creation_tokens: response.usage.cache_creation_input_tokens || 0,
    });

    let iterations = 0;
    while (response.stop_reason !== "end_turn" && iterations < MAX_ITERATIONS) {
      iterations++;

      collectSources(response.content, sources);

      messages.push({ role: "assistant", content: response.content });

      response = await (anthropic as any).beta.messages.create({
        ...mcpConfig,
        messages,
      });

      console.log({
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_tokens: response.usage.cache_read_input_tokens || 0,
        cache_creation_tokens: response.usage.cache_creation_input_tokens || 0,
      });
    }

    collectSources(response.content, sources);

    const textBlock = response.content.find((block: any) => block.type === "text");
    const assistantMessage = textBlock ? textBlock.text : "No response generated.";

    const newThreadId = threadId || `thread_${Date.now()}`;
    const updatedMessages: Anthropic.MessageParam[] = [
      ...conversationHistory,
      { role: "user" as const, content: userMessage },
      { role: "assistant" as const, content: assistantMessage },
    ].slice(-MAX_HISTORY_MESSAGES);
    threads.set(newThreadId, { messages: updatedMessages, lastAccess: Date.now() });

    if (threads.size > 100) {
      const oldestKey = threads.keys().next().value;
      if (oldestKey) threads.delete(oldestKey);
    }

    const uniqueSources = sources.filter(
      (s, i, arr) => arr.findIndex((x) => x.path === s.path) === i
    );

    res.json({
      message: assistantMessage,
      threadId: newThreadId,
      sources: uniqueSources,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat request" });
  }
}
