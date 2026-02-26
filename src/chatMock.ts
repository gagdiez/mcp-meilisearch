import type { Request, Response } from "express";

const MOCK_SOURCES = [
  { title: "NEAR Protocol Overview", path: "docs/concepts/overview" },
  { title: "Smart Contracts in NEAR", path: "docs/contracts/introduction" },
  { title: "NEAR JavaScript SDK", path: "docs/sdk/js/introduction" },
];

const MOCK_RESPONSE = `NEAR Protocol is a layer-1 blockchain designed for usability and scalability.

**Key features:**
- Human-readable account names (e.g. \`alice.near\`)
- Sharded architecture (Nightshade)
- Low transaction fees (~$0.001)
- Supports smart contracts in Rust and JavaScript via the [NEAR SDK](docs/sdk/js/introduction)

\`\`\`bash
# Install NEAR CLI
npm install -g near-cli

# Create a testnet account
near create-account myapp.testnet --useFaucet
\`\`\`

See [NEAR Protocol Overview](docs/concepts/overview) for more details.`;

const MOCK_PRELUDE_CHUNKS = [
  {
    text: "Let me search the docs for information on creating a NEAR account",
    pauseAfterMs: 350,
  },
  {
    text: "Let me fetch the full guide",
    pauseAfterMs: 300,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseChunk(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function streamTextBlock(res: Response, id: string, text: string, tokenDelayMs: number): Promise<void> {
  res.write(sseChunk({ type: "text-start", id }));

  const words = text.split(" ");
  for (const word of words) {
    res.write(sseChunk({ type: "text-delta", id, delta: word + " " }));
    await sleep(tokenDelayMs);
  }

  res.write(sseChunk({ type: "text-end", id }));
}

export async function chatMockHandler(req: Request, res: Response) {
  const { message } = req.body ?? {};

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Vercel-AI-UI-Message-Stream", "v1");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(sseChunk({ type: "start", messageId: "mock-message-1" }));

  for (let index = 0; index < MOCK_PRELUDE_CHUNKS.length; index += 1) {
    const chunk = MOCK_PRELUDE_CHUNKS[index];
    res.write(sseChunk({ type: "start-step" }));
    await streamTextBlock(res, `text-prelude-${index + 1}`, chunk.text, 16);
    res.write(sseChunk({ type: "finish-step" }));
    await sleep(chunk.pauseAfterMs);
  }

  res.write(sseChunk({ type: "start-step" }));
  await streamTextBlock(res, "text-1", MOCK_RESPONSE, 30);
  res.write(sseChunk({ type: "finish-step" }));
  res.write(
    sseChunk({
      type: "finish",
      finishReason: "stop",
      messageMetadata: { sources: MOCK_SOURCES },
    })
  );
  res.write("data: [DONE]\n\n");
  res.end();
}
