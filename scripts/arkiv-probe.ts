import { ExpirationTime } from "@arkiv-network/sdk";
import { formatEther, isAddressEqual, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ArkivWriter,
  QUOTE_LIFETIME,
  QuoteEntity,
  WHITECHAIN_USDT,
  arkivReader,
  arkivWallet,
  explorerTx,
  fetchBoard,
  quoteValues,
  signQuote,
  ARKIV_CHAIN_ID,
  type Quote,
} from "@octane/sdk";
import { env, envHex, run } from "./lib/env.js";

/**
 * Measures what the docs can't tell us: gas per refresh, write-to-query latency, and how long a
 * quote survives after its last refresh. Results go in docs/evidence.md by hand.
 */
await run(async () => {
  const accessKey = env("ARKIV_ACCESS_KEY");
  const relay = envHex("OCTANE_RELAY");
  const maker = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const reader = arkivReader(accessKey);
  const writer = new ArkivWriter(reader, arkivWallet(accessKey, maker), maker.address);

  const makeQuote = async (seq: bigint) => {
    const quote: Quote = {
      maker: maker.address,
      chainId: 1874n,
      settlement: relay,
      token: WHITECHAIN_USDT,
      maxGas: 200_000n,
      fee: parseUnits("0.08", 6),
      validUntil: BigInt(Math.floor(Date.now() / 1000)) + 105n,
      nonce: seq,
    };
    return { quote, sig: await signQuote(maker, quote) };
  };

  const board = () =>
    fetchBoard(reader, {
      chainId: 1874n,
      token: WHITECHAIN_USDT,
      now: BigInt(Math.floor(Date.now() / 1000)),
      isTrustedSettlement: (settlement) => isAddressEqual(settlement, relay),
    });

  const startBalance = await reader.getBalance({ address: maker.address });

  // Create
  const first = await makeQuote(1n);
  const createdAt = Date.now();
  const created = await writer.submit({
    creates: [
      { schema: QuoteEntity, values: quoteValues(first.quote, first.sig, "probe", 1n), expiration: QUOTE_LIFETIME },
    ],
  });
  if (created.status !== "sent") throw new Error("create skipped: an earlier transaction is pending");
  const key = created.createdEntities[0];
  if (!key) throw new Error("no entity key returned");
  console.log(`create ${Date.now() - createdAt}ms ${explorerTx(ARKIV_CHAIN_ID, created.txHash)}`);
  const createReceipt = await reader.getTransactionReceipt({ hash: created.txHash });
  console.log(`create gas ${createReceipt.gasUsed}`);

  let seen = false;
  const queryStart = Date.now();
  while (!seen && Date.now() - queryStart < 20_000) seen = (await board()).quotes.some((entry) => entry.key === key);
  console.log(`visible on board: ${seen}, after a further ${Date.now() - queryStart}ms`);

  // Patch and extend in one batch: the refresh a maker does every ~10s
  const beforeRefresh = await reader.getBalance({ address: maker.address });
  const second = await makeQuote(2n);
  const refreshed = await writer.submit({
    patches: [{ schema: QuoteEntity, entityKey: key, set: quoteValues(second.quote, second.sig, "probe", 2n) }],
    extensions: [{ entityKey: key, expiration: ExpirationTime.fromBlocks(15) }],
  });
  if (refreshed.status !== "sent") throw new Error("refresh skipped: an earlier transaction is pending");
  const refreshReceipt = await reader.getTransactionReceipt({ hash: refreshed.txHash });
  const afterRefresh = await reader.getBalance({ address: maker.address });
  console.log(`refresh gas ${refreshReceipt.gasUsed} ${explorerTx(ARKIV_CHAIN_ID, refreshed.txHash)}`);
  console.log(`refresh cost ${formatEther(beforeRefresh - afterRefresh)} tGLM`);

  const latest = (await board()).quotes.find((entry) => entry.key === key);
  console.log(`board shows seq ${latest?.seq}, expires at block ${latest?.expiresAt}`);

  // Stop refreshing and time how long it stays
  const lastRefresh = Date.now();
  let present = true;
  while (present && Date.now() - lastRefresh < 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    present = (await board()).quotes.some((entry) => entry.key === key);
  }
  console.log(`gone from board: ${!present}, ${Math.round((Date.now() - lastRefresh) / 1000)}s after the last refresh`);
  console.log(`total spent ${formatEther(startBalance - (await reader.getBalance({ address: maker.address })))} tGLM`);
});
