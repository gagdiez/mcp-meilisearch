import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { searchNearDocs } from "./searchClient.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

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

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_near_docs",
  description:
    "Search the NEAR Protocol documentation for relevant information. Use this to find accurate, up-to-date information before answering technical questions.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query to find relevant documentation",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 5)",
      },
    },
    required: ["query"],
  },
};

function collectSources(
  results: Array<{ title: string; path: string }>,
  sources: Array<{ title: string; path: string }>
) {
  for (const result of results) {
    if (result.title || result.path) {
      sources.push({ title: result.title || "Untitled", path: result.path || "" });
    }
  }
}

export async function chatHandler(req: Request, res: Response) {
  try {
    const { message, history = [] }: { message: string; history: HistoryMessage[] } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const requestConfig = {
      model: "claude-haiku-4-5",
      system: SYSTEM_PROMPT,
      tools: [SEARCH_TOOL],
      temperature: 0.1,
      max_tokens: 1024,
    };

    const sources: Array<{ title: string; path: string }> = [];
    const MAX_ITERATIONS = 5;

    let response = await anthropic!.messages.create({
      ...requestConfig,
      messages,
    });

    console.log({
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < MAX_ITERATIONS) {
      iterations++;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          if (toolUse.name === "search_near_docs") {
            const input = toolUse.input as { query: string; limit?: number };
            const results = await searchNearDocs(input.query, input.limit ?? 5);
            collectSources(results.slice(0, 3), sources);
            return {
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: JSON.stringify(results),
            };
          }
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Unknown tool: ${toolUse.name}`,
          };
        })
      );

      messages.push({ role: "user", content: toolResults });

      response = await anthropic!.messages.create({
        ...requestConfig,
        messages,
      });

      console.log({
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    const assistantMessage = textBlock ? textBlock.text : "No response generated.";

    const uniqueSources = sources.filter(
      (s, i, arr) => arr.findIndex((x) => x.path === s.path) === i
    );

    res.json({
      message: assistantMessage,
      sources: uniqueSources,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat request" });
  }
}
