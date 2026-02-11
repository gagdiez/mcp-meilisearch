import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

const threads = new Map<
  string,
  Array<Anthropic.MessageParam>
>();

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
      conversationHistory = threads.get(threadId)!;
    }

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.slice(-6),
      { role: "user", content: userMessage },
    ];

    const mcpConfig = {
      model: "claude-sonnet-4-5-20250929",
      betas: ["mcp-client-2025-11-20"],
      system: SYSTEM_PROMPT,
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
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    };

    const sources: Array<{ title: string; path: string }> = [];
    const MAX_ITERATIONS = 5;

    let response = await (anthropic as any).beta.messages.create({
      ...mcpConfig,
      messages,
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
    }

    collectSources(response.content, sources);

    const textBlock = response.content.find((block: any) => block.type === "text");
    const assistantMessage = textBlock ? textBlock.text : "No response generated.";

    const newThreadId = threadId || `thread_${Date.now()}`;
    const updatedHistory: Anthropic.MessageParam[] = [
      ...conversationHistory,
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ];
    threads.set(newThreadId, updatedHistory);

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
