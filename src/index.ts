#!/usr/bin/env node

import "dotenv/config";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./mcp.js";
import { chatHandler } from "./chat-optimal.js";

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

app.post("/api/chatMock", (_req, res) => {
  res.json({
    message: "# What is a Smart Contract on NEAR?\n\nA **smart contract** on NEAR Protocol is a self-executing program that runs on the blockchain. Think of it as code that automatically executes agreements and transactions when certain conditions are met — no middleman needed.\n\n## Key Characteristics on NEAR\n\n### Every Account is a Smart Contract\nOn NEAR, **every account is also a smart contract**. This is unique compared to other blockchains — NEAR doesn't distinguish between user accounts and contract accounts. Each account can have its own code and logic.\n\n### Asynchronous Execution\nNEAR smart contracts use **asynchronous execution**. When a contract calls another contract, it doesn't wait for the response before continuing. Instead, NEAR uses a system of **promises and callbacks** to handle these interactions, preventing the network from halting while waiting for responses.\n\n## Development Lifecycle\n\nThe typical smart contract lifecycle on NEAR includes:\n\n1. **Build**: Write your contract code\n2. **Test**: Ensure the contract works as expected\n3. **Deploy**: Once secure, deploy the contract to your account\n4. **Use**: Any user can interact with the contract through their NEAR Wallet\n5. **Monitor**: Track the contract's activity through simple APIs\n\n## Supported Languages\n\nYou can develop NEAR smart contracts in:\n- **JavaScript** - Great for web developers\n- **Rust** - Preferred for performance-critical applications\n\n*Note: Theoretically, any language that compiles to WebAssembly (Wasm) can be used, though JavaScript and Rust have the best tooling and library support.*\n\n## What Can You Build?\n\nSmart contracts power various Web3 applications:\n- **DeFi (Financial Apps)**: Lending platforms, token swaps, automated banking\n- **NFTs (Digital Art & Collectibles)**: Verified digital artwork with guaranteed authenticity\n- **Gaming**: Games where players truly own their in-game items and can trade them",
    threadId: "thread_1770940894006",
    sources: [
      {
        title: "What is a Smart Contract?",
        path: "/smart-contracts/what-is",
      },
      {
        title: "Smart Contracts",
        path: "/quest/accounts/smart-contracts",
      },
      {
        title: "Understanding Smart Contracts",
        path: "/quest/smart-contracts",
      },
      {
        title: "Your First Smart Contract",
        path: "/smart-contracts/quickstart",
      },
      {
        title: "Ensure it is the User (1yⓃ)",
        path: "/smart-contracts/security/one-yocto",
      },
    ],
  });
});

// {
//     "message": "# How to Create a NEAR Account\n\nCreating a NEAR account is straightforward. Here's how to do it:\n\n## Step 1: Choose a Wallet\n\nVisit **[wallet.near.org](https://wallet.near.org/)** and select one of the wallets listed there. All wallets on this list have been curated and are safe to use.\n\nMost wallets offer similar functionality, so you can choose any of them. However, **some wallets make it easier to create named accounts** (like `alice.testnet`), which are more memorable than implicit accounts.\n\n## Step 2: Create Your Account\n\nWhen creating your account, make sure to:\n\n- **Create a `testnet` account** (ending with `.testnet`, e.g., `alice.testnet`)\n- **NOT a `mainnet` account** (ending with `.near`)\n\n> **Why testnet?** NEAR testnet is a separate network that allows you to test applications without spending real money.\n\n## Step 3: Save Your Seed Phrase\n\n**⚠️ Critical:** Write down your seed phrase and store it securely. This is the **only way** to recover access to your account if you lose it.\n\n---\n\n## Account Types Available\n\nNEAR supports multiple account types:\n\n1. **Named accounts** - Easy to remember (e.g., `alice.near`, `bob.testnet`)\n2. **Implicit accounts** - Derived from a private key (e.g., `fb9243ce...`)\n3. **Ethereum-like accounts** - Compatible with Ethereum wallets\n\n---\n\n## What You Can Do With Your Account\n\nOnce created, your NEAR account allows you to:\n- Hold tokens and collectibles\n- Send and receive transfers\n- Interact with smart contracts\n- Create and use decentralized applications\n- Control accounts on other blockchains (like Ethereum or Bitcoin)\n\n---\n\nIf you need to import an existing account into another wallet or tool later, check the documentation on [Importing a NEAR Account](/tutorials/protocol/importing-account).",
//     "threadId": "thread_1770951299853",
//     "sources": [
//         {
//             "title": "Create a NEAR Account",
//             "path": "/tutorials/protocol/create-account"
//         },
//         {
//             "title": "Introduction",
//             "path": "/quest/accounts/introduction"
//         },
//         {
//             "title": "NEAR Accounts",
//             "path": "/protocol/account-model"
//         },
//         {
//             "title": "Importing a NEAR Account",
//             "path": "/tutorials/protocol/importing-account"
//         },
//         {
//             "title": "Takeaways",
//             "path": "/quest/accounts/takeaways"
//         }
//     ]
// }

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
  console.log(`POST MCP requests to http://localhost:${PORT}/mcp`);
  console.log(`Chat API available at http://localhost:${PORT}/api/chat`);
});
