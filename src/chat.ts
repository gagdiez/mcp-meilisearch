import type { Request, Response } from "express";
import { streamText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { searchNearDocs } from "./searchClient.js";
import { fetchNearDoc } from "./webSearch.js";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You answer questions about NEAR Protocol using the tools searchDocs and fetchDoc to find relevant information in the NEAR documentation.

Rules:
- Keep answers concise.
- Use ONLY information from tools results. NEVER invent APIs, methods, or code not present in the docs.
- If the user requests a specific doc, fetch it to find the answer. Otherwise, search the docs for relevant information.
- If the search returns docs that are not relevant, you might need to search with different keywords.
- Explain in one line what you will do if you use a tool (e.g. "Let me search the docs" or "Let me fetch that doc"), include a new line after that.
- You might not need to use both tools, but you should use at least one to find the answer.
- If after using the tools you can't find the answer, say "I couldn't find an answer in the docs."
- Use Markdown with code blocks, headings, and bold for key terms.
- Include code examples and CLI commands from the docs when relevant.
- Do not start with a title, and never enumerate sections (i.e. say "Title" instead of "1. Title").
- Do not use ":::" for admonitions, simply use "Note:", "Warning:", etc.
- Include inline references using the format [title](path).`;

export async function chatHandler(req: Request, res: Response) {
  try {
    const { message, history = [] }: { message: string; history: HistoryMessage[] } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    let sources: {title: string; path: string;}[] = [];

    const result = streamText({
      model: anthropic("claude-haiku-4-5"),
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
      tools: {
        searchDocs: tool({
          description: "Search the NEAR Protocol documentation index for relevant snippets.",
          inputSchema: z.object({
            query: z.string().describe("Search query"),
          }),
          execute: async ({ query }) => {
            const results = await searchNearDocs(query);
            for (const r of results) {
              if (r.path && !sources.some((s) => s.path === r.path)) {
                sources.push({ title: r.title, path: r.path });
              }
            }
            return results.map((r) => ({ title: r.title, path: r.path, content: r.content }));
          },
        }),
        fetchDoc: tool({
          description: "Fetch a full NEAR Protocol documentation page as Markdown.",
          inputSchema: z.object({
            path: z.string().describe("Doc PATH ending in .md, e.g. 'tutorials/quickstart.md' - not the full URL"),
          }),
          execute: async ({ path }) => fetchNearDoc(path),
        }),
      },
      stopWhen: stepCountIs(5),
      temperature: 0,
      maxOutputTokens: 1024,
    });

    result.pipeUIMessageStreamToResponse(res, {
      messageMetadata: ({ part }) =>
        part.type === "finish" ? { sources } : undefined,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process chat request" })}\n\n`);
    res.end();
  }
}
