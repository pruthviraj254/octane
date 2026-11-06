import { CONCIERGE_SYSTEM, parseConciergeReply, parseIntent, settledWithoutLlm } from "@octane/sdk";
import { createLlm } from "@octane/sdk/llm";
import { getAddress, isAddress } from "viem";
import { serverSetting } from "@/lib/server-settings";

const MAX_TEXT = 200;

/** Demo contacts. A real wallet would use the payer's own address book or ENS. */
const contacts: Record<string, string | undefined> = {
  rahul: process.env.NEXT_PUBLIC_MERCHANT,
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  if (typeof body.text !== "string" || body.text.trim() === "" || body.text.length > MAX_TEXT) {
    return Response.json({ error: "send a short payment request" }, { status: 400 });
  }
  const text = body.text.trim();

  let intent = parseIntent(text);
  if (!settledWithoutLlm(text)) {
    try {
      const llm = createLlm({
        provider: serverSetting("LLM_PROVIDER"),
        apiKey: serverSetting("ANTHROPIC_API_KEY"),
        apiModel: serverSetting("ANTHROPIC_MODEL"),
        cliModel: serverSetting("LLM_MODEL"),
        timeoutMs: 15_000,
      });
      if (llm) intent = parseConciergeReply(await llm.complete(CONCIERGE_SYSTEM, text), text);
    } catch {
      // The plain parser's answer stands, so a payment never depends on the LLM.
    }
  }
  if (intent.action === "amount") return Response.json({ intent, address: getAddress(intent.to) });
  if (intent.action !== "pay") return Response.json({ intent });

  const address = isAddress(intent.to) ? getAddress(intent.to) : contacts[intent.to.toLowerCase()];
  if (!address) {
    return Response.json({ intent: { action: "unknown", reply: `I don't know ${intent.to} yet. Try their address.` } });
  }
  return Response.json({ intent, address });
}
