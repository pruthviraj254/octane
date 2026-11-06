"use client";

import { OCTANE_RELAY_ABI, WHITECHAIN_USDT, explorerTx, resolveIdentity } from "@octane/sdk";
import { ArrowDownLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { erc20Abi, isAddressEqual, type Address, type Hash } from "viem";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { Badge, Empty, External, PageHeader, SectionTitle, Skeleton, Stat } from "@/components/ui";
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
    <section>
      <PageHeader
        title={
          <>
            Every payment, <em>settled.</em>
          </>
        }
        description="Stablecoin payments, each settled onchain in one transaction."
      />

      <div className="mt-10 grid grid-cols-2 gap-3">
        <Stat large label="Balance" value={balance === undefined ? <Skeleton className="h-11 w-32" /> : <Ticker value={money(balance)} />} hint="USDT" />
        <Stat
          large
          label="Received recently"
          value={sales ? <Ticker value={money(received)} /> : <Skeleton className="h-11 w-32" />}
          hint={sales ? `${sales.length} ${sales.length === 1 ? "payment" : "payments"}` : "USDT"}
        />
      </div>

      <div className="mt-10">
        <SectionTitle>Recent payments</SectionTitle>
        {sales === undefined ? (
          <Skeleton className="block h-20 w-full rounded-2xl" />
        ) : sales.length === 0 ? (
          <Empty>No payments in the last few hours.</Empty>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <AnimatePresence initial={false}>
              {sales.map((sale) => (
                <motion.article
                  key={sale.hash}
                  layout="position"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="flex items-center gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:gap-4 sm:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-bright">
                    <ArrowDownLeft size={17} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-medium tabular-nums">
                      +{money(sale.received)} USDT
                      {sale.merchantPaid && <Badge>You covered {money(sale.fee)} fee</Badge>}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-3">from {sale.payer}</p>
                  </div>
                  <External href={explorerTx(1874, sale.hash)}>Receipt</External>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
