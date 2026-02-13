import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { searchNearDocs, type SearchResult } from "./searchClient.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

interface HistoryEntry {
  role: "user" | "assistant";
  text: string;
}

interface ThreadData {
  entries: HistoryEntry[];
  lastAccess: number;
}

const threads = new Map<string, ThreadData>();

const MAX_HISTORY_ENTRIES = 4;
const MAX_HISTORY_CHAR = 200;
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

## Critical rules
- Answer ONLY using the documents provided inside <search_results>. Do NOT use your training knowledge for technical NEAR questions.
- If the search results do not contain enough information to answer, say so clearly: "I couldn't find documentation about that topic." Suggest related topics if possible.
- NEVER invent function names, API endpoints, SDK methods, or code examples that are not in the provided documents.

## Response guidelines
- Always answer in the same language the user writes in
- Include working code examples when relevant, using the latest NEAR SDK patterns from the docs
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

function buildSearchContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "<search_results>\nNo documents found for this query.\n</search_results>";
  }

  const docs = results
    .map(
      (r, i) =>
        `<doc index="${i + 1}">\n<title>${r.title}</title>\n<path>${r.path}</path>\n<content>${r.content}</content>\n</doc>`
    )
    .join("\n");

  return `<search_results>\n${docs}\n</search_results>`;
}

function buildHistoryContext(history: HistoryEntry[]): string {
  if (history.length === 0) return "";

  const recent = history.slice(-MAX_HISTORY_ENTRIES);
  const lines = recent.map(
    (entry) =>
      `${entry.role}: ${entry.text.slice(0, MAX_HISTORY_CHAR)}`
  );

  return `<conversation_history>\n${lines.join("\n")}\n</conversation_history>\n\n`;
}

export async function chatHandler(req: Request, res: Response) {
  try {
    const { messages: userMessage, threadId } = req.body;

    if (!userMessage) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    if (!anthropic) {
      res.status(500).json({ error: "Anthropic API key not configured" });
      return;
    }

    const searchResults = await searchNearDocs(userMessage);

    let history: HistoryEntry[] = [];
    if (threadId && threads.has(threadId)) {
      const thread = threads.get(threadId)!;
      thread.lastAccess = Date.now();
      history = thread.entries;
    }
    const historyContext = buildHistoryContext(history);
    const searchContext = buildSearchContext(searchResults);

    const userContent = `${historyContext}${searchContext}\n\n${userMessage}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      temperature: 0,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    console.log({
      response,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: (response.usage as any).cache_read_input_tokens || 0,
      cache_creation_tokens: (response.usage as any).cache_creation_input_tokens || 0,
      search_hits: searchResults.length,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const assistantMessage = textBlock && textBlock.type === "text"
      ? textBlock.text
      : "No response generated.";

    const newThreadId = threadId || `thread_${Date.now()}`;
    const updatedEntries: HistoryEntry[] = [
      ...history,
      { role: "user" as const, text: userMessage },
      { role: "assistant" as const, text: assistantMessage },
    ].slice(-MAX_HISTORY_ENTRIES);
    threads.set(newThreadId, { entries: updatedEntries, lastAccess: Date.now() });

    if (threads.size > 100) {
      const oldestKey = threads.keys().next().value;
      if (oldestKey) threads.delete(oldestKey);
    }

    const sources = searchResults
      .filter((r) => r.path)
      .map((r) => ({ title: r.title, path: r.path }));

    res.json({
      message: assistantMessage,
      threadId: newThreadId,
      sources,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat request" });
  }
}