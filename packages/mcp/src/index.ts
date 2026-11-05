import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ArkivWriter,
  CHAINS,
  arkivReader,
  arkivWallet,
  explorerTx,
  fetchFills,
  getQuotes,
  payOnEfDevnet,
  payOnWhitechain,
  redactAccessKey,
  runAuction,
  resolveIdentity,
  type Chain,
  type MarketConfig,
} from "@octane/sdk";
import { formatUnits, isAddress, parseGwei, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { SpendCaps } from "./caps.ts";

/** Keys are read from the private .env file, so none appear in MCP config or arguments. */
const envFile = new URL("../../../.env", import.meta.url);
const settings: Record<string, string | undefined> = existsSync(envFile)
  ? parseEnv(readFileSync(envFile, "utf8"))
  : {};

function setting(name: string): string {
  const value = process.env[name] ?? settings[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const decimals = 6;
const agentKey = setting("PAYER_AGENT_PRIVATE_KEY") as Hex;
const agent = privateKeyToAccount(agentKey);
const market: MarketConfig = {
  reader: arkivReader(setting("ARKIV_ACCESS_KEY")),
  relay: setting("OCTANE_RELAY") as Address,
  factory: setting("OCTANE_FACTORY") as Address,
};
const caps = new SpendCaps(BigInt(setting("AGENT_MAX_FEE")), BigInt(setting("AGENT_DAILY_CAP")));

const chainInput = z.enum(["whitechain", "ef-devnet"]).describe('"whitechain" settles in USDT, "ef-devnet" in USDC');

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: redactAccessKey(error instanceof Error ? error.message : String(error)) }],
});

const server = new McpServer({ name: "octane", version: "0.1.0" });

server.registerTool(
  "get_gas_quote",
  {
    description:
      "Lists live gas quotes from Octane's open market, cheapest first. No gas token is needed: the fee is one stablecoin payment to the maker that settles the transaction.",
    inputSchema: { chain: chainInput },
  },
  async ({ chain }) => {
    try {
      const { quotes } = await getQuotes(market, chain);
      const { symbol } = CHAINS[chain];
      return text(
        await Promise.all(
          quotes.map(async (entry) => ({
            maker: (await resolveIdentity(entry.quote.maker)).label,
            style: entry.style,
            fee: `${formatUnits(entry.quote.fee, decimals)} ${symbol}`,
            signedValiditySeconds: Number(entry.quote.validUntil) - Math.floor(Date.now() / 1000),
          })),
        ),
      );
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "send_sponsored",
  {
    description:
      "Pays someone in stablecoins through the cheapest live maker. The agent holds no gas token: it signs, and the maker pays the gas and takes its fee in the same transaction. Returns an explorer link.",
    inputSchema: {
      chain: chainInput,
      to: z.string().describe("Recipient address"),
      amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe('Amount in whole tokens, for example "5" or "0.25"'),
    },
  },
  async ({ chain, to, amount }) => {
    try {
      if (!isAddress(to)) throw new Error(`"${to}" isn't an address`);
      const value = parseUnits(amount, decimals);
      if (value === 0n) throw new Error("the amount must be above zero");
      caps.check(value);

      const result =
        (chain as Chain) === "whitechain"
          ? await payOnWhitechain(market, { payer: agent, to, amount: value, maxFee: caps.maxFee })
          : await payOnEfDevnet(market, {
              sender: agent.address,
              privateKey: agentKey,
              payments: [{ to, amount: value }],
              maxFee: caps.maxFee,
              maxFeePerGas: parseGwei("2"),
            });

      caps.record(value + result.fee);
      const { symbol } = CHAINS[chain];
      return text({
        paid: `${amount} ${symbol}`,
        fee: `${formatUnits(result.fee, decimals)} ${symbol}`,
        maker: result.makerStyle,
        explorer: result.explorerUrl,
        spentTodayBaseUnits: caps.spentToday().toString(),
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "send_batch",
  {
    description:
      "Pays up to 60 people in one frame transaction on the EF devnet, for one maker fee. Pays in USDC, and the agent holds no ETH.",
    inputSchema: {
      payments: z
        .array(
          z.object({
            to: z.string().describe("Recipient address"),
            amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("Amount in whole USDC"),
          }),
        )
        .min(1)
        .max(60),
    },
  },
  async ({ payments }) => {
    try {
      const parsed = payments.map(({ to, amount }) => {
        if (!isAddress(to)) throw new Error(`"${to}" isn't an address`);
        return { to, amount: parseUnits(amount, decimals) };
      });
      const total = parsed.reduce((sum, payment) => sum + payment.amount, 0n);
      caps.check(total);
      const result = await payOnEfDevnet(market, {
        sender: agent.address,
        privateKey: agentKey,
        payments: parsed,
        maxFee: caps.maxFee,
        maxFeePerGas: parseGwei("2"),
      });
      caps.record(total + result.fee);
      return text({
        paid: `${formatUnits(total, decimals)} USDC to ${parsed.length} people`,
        fee: `${formatUnits(result.fee, decimals)} USDC, once`,
        maker: result.makerStyle,
        explorer: result.explorerUrl,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "get_fill_history",
  {
    description:
      "Lists settled payments, newest first, straight from Arkiv. Leave `maker` out to see this agent's own gas spend. Pass `nextCursor` from a result to read the next page.",
    inputSchema: {
      maker: z.string().optional().describe("A maker's address, for its statement"),
      cursor: z.number().int().nonnegative().optional(),
    },
  },
  async ({ maker, cursor }) => {
    try {
      if (maker && !isAddress(maker)) throw new Error(`"${maker}" isn't an address`);
      const page = await fetchFills(market.reader, {
        indexer: setting("INDEXER_ADDRESS") as Address,
        ...(maker ? { maker: maker as Address } : { payer: agent.address }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return text({
        total: page.total.toString(),
        nextCursor: page.nextCursor ?? null,
        fills: page.fills.map((fill) => ({
          chainId: fill.chainId.toString(),
          fee: formatUnits(fill.fee, decimals),
          when: new Date(Number(fill.ts) * 1000).toISOString(),
          explorer: explorerTx(Number(fill.chainId), fill.txHash),
        })),
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "post_gas_request",
  {
    description:
      "Runs a gas auction on Arkiv for several payments on Whitechain: posts the job, waits about 15 seconds for AI makers to bid, takes the cheapest reliable bid, and settles every payment with that maker.",
    inputSchema: {
      payments: z
        .array(
          z.object({
            to: z.string().describe("Recipient address"),
            amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("Amount in whole USDT"),
          }),
        )
        .min(1)
        .max(10),
      maxFee: z.string().regex(/^\d+(\.\d{1,6})?$/).optional().describe("Highest fee per payment, in USDT"),
    },
  },
  async ({ payments, maxFee }) => {
    try {
      const jobs = payments.map(({ to, amount }) => {
        if (!isAddress(to)) throw new Error(`"${to}" isn't an address`);
        return { to, amount: parseUnits(amount, decimals) };
      });
      const total = jobs.reduce((sum, job) => sum + job.amount, 0n);
      caps.check(total);

      const auction = await runAuction(market, {
        writer: new ArkivWriter(market.reader, arkivWallet(setting("ARKIV_ACCESS_KEY"), agent), agent.address),
        payer: agent,
        jobs,
        maxFee: maxFee ? parseUnits(maxFee, decimals) : caps.maxFee,
      });
      caps.record(total + auction.winner.quote.fee * BigInt(jobs.length));
      return text({
        request: auction.requestKey,
        bids: auction.bids.map((bid) => ({ maker: bid.style, fee: `${formatUnits(bid.quote.fee, decimals)} USDT` })),
        winner: auction.winner.style,
        payments: auction.payments.map((payment) => payment.explorerUrl),
      });
    } catch (error) {
      return failure(error);
    }
  },
);

// stdout carries the protocol, so anything else goes to stderr.
await server.connect(new StdioServerTransport());
console.error(`octane mcp ready for agent ${agent.address}`);
