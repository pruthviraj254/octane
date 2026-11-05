"use client";

import { OCTANE_RELAY_ABI, WHITECHAIN_USDT, explorerTx, resolveIdentity } from "@octane/sdk";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, isAddressEqual, type Address, type Hash } from "viem";
import { MERCHANT, getMarket, whitechain } from "@/lib/market";

const POLL_MS = 5_000;
/** The public RPC allows 10,000 blocks per query, about 2.8 hours at 1s blocks. */
const LOG_WINDOW = 9_000n;

interface Sale {
  hash: Hash;
  payer: string;
  amount: bigint;
  fee: bigint;
  received: bigint;
  merchantPaid: boolean;
}

export function Merchant() {
  const [balance, setBalance] = useState<bigint | undefined>();
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const latest = await whitechain.getBlockNumber();
        const [held, logs] = await Promise.all([
          whitechain.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "balanceOf", args: [MERCHANT] }),
          whitechain.getContractEvents({
            address: getMarket().relay,
            abi: OCTANE_RELAY_ABI,
            eventName: "Relayed",
            fromBlock: latest - LOG_WINDOW,
            toBlock: latest,
          }),
        ]);
        const mine = logs.filter((log) => log.args.merchant && isAddressEqual(log.args.merchant, MERCHANT));
        const rows = await Promise.all(
          mine.reverse().map(async (log) => {
            const { amount = 0n, fee = 0n, feePayer, payer } = log.args;
            const merchantPaid = feePayer !== undefined && isAddressEqual(feePayer, MERCHANT);
            return {
              hash: log.transactionHash,
              payer: (await resolveIdentity(payer as Address)).label,
              amount,
              fee,
              merchantPaid,
              received: merchantPaid ? amount - fee : amount,
            };
          }),
        );
        if (stopped) return;
        setBalance(held);
        setSales(rows);
      } catch {
        // The next poll tries again.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Merchant</h1>
      <p className="mt-1 text-sm text-zinc-400">Payments arrive in USDT, settled onchain in one transaction.</p>

      <div className="mt-6 rounded-2xl border border-zinc-800 p-6">
        <p className="text-sm text-zinc-400">Balance</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {balance === undefined ? "…" : formatUnits(balance, 6)} <span className="text-xl text-zinc-400">USDT</span>
        </p>
      </div>

      <h2 className="mt-8 font-medium text-zinc-200">Recent payments</h2>
      <div className="mt-3 space-y-3">
        {sales.map((sale) => (
          <article key={sale.hash} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 p-4">
            <div className="min-w-0">
              <p className="font-medium tabular-nums">+{formatUnits(sale.received, 6)} USDT</p>
              <p className="truncate text-sm text-zinc-400">
                from <span className="font-mono">{sale.payer}</span>
                {sale.merchantPaid && ` · you covered the ${formatUnits(sale.fee, 6)} USDT fee`}
              </p>
            </div>
            <a href={explorerTx(1874, sale.hash)} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-orange-400 underline">
              Receipt
            </a>
          </article>
        ))}
        {sales.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 p-6 text-center text-zinc-400">No payments in the last few hours.</p>
        )}
      </div>
    </section>
  );
}
