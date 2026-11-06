"use client";

import { OCTANE_RELAY_ABI, WHITECHAIN_USDT, explorerTx, resolveIdentity } from "@octane/sdk";
import { ArrowDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { erc20Abi, isAddressEqual, type Address, type Hash } from "viem";
import { Badge, Empty, External, List, PageHeader, Skeleton, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { MERCHANT, getMarket, whitechain } from "@/lib/market";

const POLL_MS = 5_000;
/** The public RPC allows 10,000 blocks per query, about 2.8 hours at 1s blocks. */
const LOG_WINDOW = 9_000n;

interface Sale {
  hash: Hash;
  payer: string;
  fee: bigint;
  received: bigint;
  merchantPaid: boolean;
}

export function Merchant() {
  const [balance, setBalance] = useState<bigint | undefined>();
  const [sales, setSales] = useState<Sale[] | undefined>();

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

  const received = sales?.reduce((sum, sale) => sum + sale.received, 0n) ?? 0n;

  return (
    <section className="animate-rise">
      <PageHeader title="Merchant" description="Stablecoin payments, each settled onchain in one transaction." />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
        <Stat label="Balance" value={balance === undefined ? <Skeleton className="h-6 w-24" /> : money(balance)} hint="USDT" />
        <Stat label="Received recently" value={sales ? money(received) : <Skeleton className="h-6 w-24" />} hint={sales ? `${sales.length} payments` : "USDT"} />
      </div>

      <h2 className="mb-2.5 mt-8 text-sm font-medium">Recent payments</h2>
      {sales === undefined ? (
        <Skeleton className="block h-16 w-full rounded-xl" />
      ) : sales.length === 0 ? (
        <Empty>No payments in the last few hours.</Empty>
      ) : (
        <List>
          {sales.map((sale) => (
            <article key={sale.hash} className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive">
                <ArrowDownLeft size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium tabular-nums">
                  +{money(sale.received)} USDT
                  {sale.merchantPaid && <Badge>You covered {money(sale.fee)} fee</Badge>}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-ink-3">from {sale.payer}</p>
              </div>
              <External href={explorerTx(1874, sale.hash)}>Receipt</External>
            </article>
          ))}
        </List>
      )}
    </section>
  );
}
