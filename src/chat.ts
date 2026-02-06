import type { Request, Response } from "express";
import Groq from "groq-sdk";
import { Meilisearch } from "meilisearch";


const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_SEARCH_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

const meiliClient = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const chatIndex = meiliClient.index(MEILI_INDEX_NAME);

const threads = new Map<string, Array<{ role: string; content: string }>>();

const SYSTEM_PROMPT = `You are an expert assistant for NEAR Protocol documentation.
Your role is to help developers understand and build on NEAR Protocol based on the official documentation.

## Response guidelines
- Answer questions based ONLY on the provided documentation context. Do not invent or assume information
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

async function searchDocs(query: string) {
  try {
    const results = await chatIndex.search(query, {
      hybrid: {
        semanticRatio: 0.7,
        embedder: "default",
      },
      limit: 5,
    });
    return results.hits;
  } catch (error: any) {
    console.error("Search error:", error.message);
    return [];
  }
}

function buildContext(docs: any[]) {
  if (docs.length === 0) {
    return "No relevant documentation found.";
  }

  return docs
    .map((doc) => {
      const title = doc.title || "Untitled";
      const content = doc.content || "";
      const path = doc.path || "";
      return `### ${title}\nPath: ${path}\n\n${content.substring(0, 2000)}`;
    })
    .join("\n\n---\n\n");
}

export async function chatHandler(req: Request, res: Response) {
  if (!groq) {
    res.status(503).json({ error: "GROQ_API_KEY is not configured" });
    return;
  }

  try {
    const { messages: userMessage, threadId } = req.body;

    if (!userMessage) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (threadId && threads.has(threadId)) {
      conversationHistory = threads.get(threadId)!;
    }

    const docs = await searchDocs(userMessage);
    const context = buildContext(docs);

    const groqMessages = [
      {
        role: "system" as const,
        content: `${SYSTEM_PROMPT}\n\n## Documentation Context:\n\n${context}`,
      },
      ...conversationHistory.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: groqMessages,
      temperature: 0.3,
      max_tokens: 1024,
    });

    const assistantMessage =
      completion.choices[0]?.message?.content || "No response generated.";

    const newThreadId = threadId || `thread_${Date.now()}`;
    const updatedHistory = [
      ...conversationHistory,
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ];
    threads.set(newThreadId, updatedHistory);

    if (threads.size > 100) {
      const oldestKey = threads.keys().next().value;
      if (oldestKey) threads.delete(oldestKey);
    }

    const sources = docs.slice(0, 3).map((doc: any) => ({
      title: doc.title,
      path: doc.path,
    }));

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
