import { createServer } from "node:http";
import {
  OCTANE_RELAY_ABI,
  explorerTx,
  hashQuote,
  isSignedByMaker,
  parseRelayJobJson,
  redactAccessKey,
  type RelayJob,
} from "@octane/sdk";
import { isAddressEqual, type Account, type Address, type Hash } from "viem";
import type { WhitechainClients } from "./chain.ts";
import type { Journal } from "./journal.ts";

/** Refuses a payer that sends jobs faster than this. Part of the griefing shield. */
const MIN_MS_BETWEEN_PAYER_JOBS = 1_000;

export interface RelayerDeps extends WhitechainClients {
  port: number;
  relay: Address;
  maker: Account;
  journal: Journal;
}

class JobRefused extends Error {}

/** Takes signed jobs from payers, checks them, and settles them with the maker's own WBT. */
export function startRelayer(deps: RelayerDeps) {
  const { client, wallet, relay, maker, journal, port } = deps;
  const lastJob = new Map<string, number>();
  // Transactions from one wallet go out one at a time.
  let queue: Promise<unknown> = Promise.resolve();

  async function check(job: RelayJob): Promise<void> {
    const { quote, payment } = job;
    if (!isAddressEqual(quote.maker, maker.address)) throw new JobRefused("this quote belongs to another maker");
    if (!isAddressEqual(quote.settlement, relay)) throw new JobRefused("wrong settlement contract");
    if (quote.chainId !== BigInt(wallet.chain.id)) throw new JobRefused("wrong chain");
    if (quote.validUntil <= BigInt(Math.floor(Date.now() / 1000))) throw new JobRefused("quote expired");
    if (!(await isSignedByMaker(quote, job.quoteSig))) throw new JobRefused("not a quote this maker signed");

    const seen = lastJob.get(payment.payer.toLowerCase());
    if (seen && Date.now() - seen < MIN_MS_BETWEEN_PAYER_JOBS) throw new JobRefused("too many jobs from this payer");
    lastJob.set(payment.payer.toLowerCase(), Date.now());
  }

  // Each path simulates immediately before sending: a job that would revert costs nothing to refuse.
  async function send(job: RelayJob): Promise<Hash> {
    if (job.optIn) {
      const { request } = await client.simulateContract({
        account: maker,
        address: relay,
        abi: OCTANE_RELAY_ABI,
        functionName: "relayMerchantPays",
        args: [job.quote, job.quoteSig, job.payment, job.authSig, job.optIn.terms, job.optIn.signature],
      });
      return wallet.writeContract(request);
    }
    const { request } = await client.simulateContract({
      account: maker,
      address: relay,
      abi: OCTANE_RELAY_ABI,
      functionName: "relay",
      args: [job.quote, job.quoteSig, job.payment, job.authSig],
    });
    return wallet.writeContract(request);
  }

  async function settle(job: RelayJob): Promise<Hash> {
    const hash = await send(job);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`relay reverted: ${hash}`);
    return hash;
  }

  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");

    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (request.method === "OPTIONS") return reply(204, {});
    if (request.method === "GET" && request.url === "/health") return reply(200, { maker: maker.address });
    if (request.method !== "POST" || request.url !== "/jobs") return reply(404, { error: "not found" });

    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 20_000) request.destroy();
    });
    request.on("end", () => {
      void (async () => {
        let job: RelayJob;
        try {
          job = parseRelayJobJson(body);
        } catch {
          return reply(400, { error: "malformed job" });
        }
        try {
          await check(job);
          const run = queue.then(() => settle(job));
          queue = run.catch(() => undefined);
          const txHash = await run;
          const explorerUrl = explorerTx(wallet.chain.id, txHash);
          journal.write("relayed", {
            txHash,
            quoteHash: hashQuote(job.quote),
            payer: job.payment.payer,
            merchant: job.payment.merchant,
            amount: job.payment.amount,
            fee: job.quote.fee,
            merchantPays: Boolean(job.optIn),
          });
          reply(200, { txHash, explorerUrl });
        } catch (error) {
          const refused = error instanceof JobRefused;
          const reason = refused ? error.message : "simulation or submission failed";
          journal.write("refused", {
            reason,
            payer: job.payment.payer,
            detail: refused ? undefined : redactAccessKey(String(error)).slice(0, 200),
          });
          reply(refused ? 422 : 502, { error: reason });
        }
      })();
    });
  });

  server.listen(port, "127.0.0.1");
  return server;
}
