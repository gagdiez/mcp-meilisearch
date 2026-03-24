import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { NEAR } from "near-api-js/tokens";
import { Request, Response } from "express";

// This can be hardcoded here since we only use it to create a temporary testnet account that is
// deleted immediately after funding the beneficiary.
const FAUCET_SECRET_KEY =
  "ed25519:5mixhRL3GcXL9sXx9B4juv6cp3Js4Qo7qY9gWs8bzcQGeSbefXMkCJh5UpmwZYriitMjsppqV4W8zb5bREkYRxLh";

async function createAndDeleteTmpAcc(beneficiary: string): Promise<void> {
  const tmpAccount = `${beneficiary.slice(0, 32).replaceAll(".", "-")}-${Date.now()}.testnet`;

  const signer = KeyPairSigner.fromSecretKey(FAUCET_SECRET_KEY);
  const publicKey = await signer.getPublicKey();

  await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newAccountId: tmpAccount,
      newAccountPublicKey: publicKey.toString(),
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
  const account = new Account(tmpAccount, provider, signer);

  await account.transfer({ receiverId: beneficiary, amount: NEAR.toUnits("5") });
  await account.deleteAccount("testnet");
}

export async function faucetHandler(req: Request, res: Response): Promise<void> {
  const { accountId } = req.body;

  if (!accountId || typeof accountId !== "string") {
    res.status(400).json({ error: "Please provide a valid accountId" });
    return;
  }

  try {
    await createAndDeleteTmpAcc(accountId);
    res.json({ success: true, message: `Funded ${accountId} with 5 NEAR` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "An error occurred";
    res.status(500).json({ error: message });
  }
}