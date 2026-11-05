import { WHITECHAIN_USDT, arkivReader, fetchBoard } from "@octane/sdk";
import { formatUnits, isAddressEqual } from "viem";
import { env, envHex, run } from "./lib/env.ts";

/** Prints the board whenever it changes. Usage: board-watch <seconds>. */
await run(async () => {
  const relay = envHex("OCTANE_RELAY");
  const reader = arkivReader(env("ARKIV_ACCESS_KEY"));
  const until = Date.now() + Number(process.argv[2] ?? 60) * 1000;
  const started = Date.now();
  let last = "";
  while (Date.now() < until) {
    try {
      const { quotes } = await fetchBoard(reader, {
        chainId: 1874n,
        token: WHITECHAIN_USDT,
        now: BigInt(Math.floor(Date.now() / 1000)),
        isTrustedSettlement: (settlement) => isAddressEqual(settlement, relay),
      });
      const line = quotes.map((entry) => entry.style).join(" ");
      if (line !== last) {
        const prices = quotes.map((entry) => `${entry.style} ${formatUnits(entry.quote.fee, 6)}`).join(" · ");
        console.log(`t+${Math.round((Date.now() - started) / 1000)}s: ${prices || "(empty)"}`);
        last = line;
      }
    } catch {
      // A failed read says nothing about the board.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
});
