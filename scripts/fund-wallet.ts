import { arkivReader, payOnEfDevnet, payOnWhitechain, type MarketConfig } from "@octane/sdk";
import { isAddress, parseGwei, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

/** Funds a wallet from the payer agent, through the market itself. Usage: fund-wallet <address> <usdt> <usdc> */
await run(async () => {
  const to = process.argv[2];
  if (!to || !isAddress(to)) throw new Error("usage: fund-wallet <address> <usdt> <usdc>");
  const usdt = parseUnits(process.argv[3] ?? "1", 6);
  const usdc = parseUnits(process.argv[4] ?? "1", 6);

  const key = envHex("PAYER_AGENT_PRIVATE_KEY");
  const market: MarketConfig = {
    reader: arkivReader(env("ARKIV_ACCESS_KEY")),
    relay: envHex("OCTANE_RELAY"),
    factory: envHex("OCTANE_FACTORY"),
  };
  const maxFee = parseUnits("0.5", 6);

  if (usdt > 0n) {
    const paid = await payOnWhitechain(market, { payer: privateKeyToAccount(key), to: to as Address, amount: usdt, maxFee });
    console.log(`USDT via ${paid.makerStyle}: ${paid.explorerUrl}`);
  }
  if (usdc > 0n) {
    const paid = await payOnEfDevnet(market, {
      sender: privateKeyToAccount(key).address,
      privateKey: key,
      payments: [{ to: to as Address, amount: usdc }],
      maxFee,
      maxFeePerGas: parseGwei("2"),
    });
    console.log(`USDC via ${paid.makerStyle}: ${paid.explorerUrl}`);
  }
});
