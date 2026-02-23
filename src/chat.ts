import type { Request, Response } from "express";
import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { searchNearDocs } from "./searchClient.js";

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

export async function chatHandler(req: Request, res: Response) {
  try {
    const { message, history = [] }: { message: string; history: HistoryMessage[] } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const sources: Array<{ title: string; path: string }> = [];

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
      tools: {
        search_near_docs: tool({
          description:
            "Search the NEAR Protocol documentation for relevant information. Use this to find accurate, up-to-date information before answering technical questions.",
          inputSchema: z.object({
            query: z.string().describe("The search query to find relevant documentation"),
            limit: z.number().optional().describe("Maximum number of results to return (default: 5)"),
          }),
          execute: async ({ query, limit = 5 }) => {
            const results = await searchNearDocs(query, limit);
            for (const result of results.slice(0, 3)) {
              if (result.title || result.path) {
                sources.push({ title: result.title || "Untitled", path: result.path || "" });
              }
            }
            return results;
          },
        }),
      },
      stopWhen: stepCountIs(5),
      temperature: 0.1,
      maxOutputTokens: 1024,
    });

    const uniqueSources = sources.filter(
      (s, i, arr) => arr.findIndex((x) => x.path === s.path) === i
    );

    res.json({
      message: text,
      sources: uniqueSources,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat request" });
  }
}
