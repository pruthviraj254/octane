import { arkivReader } from "@octane/sdk";
import { serverSetting } from "@/lib/server-settings";

/** Reads only. A browser never writes to Arkiv, so nothing else passes through here. */
const READS = new Set(["arkiv_query", "eth_blockNumber", "eth_chainId", "eth_getBlockByNumber"]);
const MAX_BODY_BYTES = 8_192;

const failure = (id: unknown, message: string) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32_000, message } });

/** Adds the access key on the server, so the key stays out of the browser. */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return failure(null, "request too large");

  let call: { id?: unknown; method?: unknown };
  try {
    call = JSON.parse(text) as { id?: unknown; method?: unknown };
  } catch {
    return failure(null, "invalid request");
  }
  if (typeof call.method !== "string" || !READS.has(call.method)) return failure(call.id, "only reads are allowed here");

  // With no key this is Arkiv's keyless public endpoint. It rate limits a busy page, but a
  // fresh copy of the app still shows the real market.
  const url = arkivReader(serverSetting("ARKIV_ACCESS_KEY") ?? "").chain.rpcUrls.default.http[0];
  if (!url) return failure(call.id, "no Arkiv endpoint");

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    // Fetch errors repeat the URL, and the key is part of it, so none of that goes back.
    return failure(call.id, "Arkiv didn't answer");
  }
}
