"use client";

import { explorerTx, fetchFills, resolveIdentity, type Fill } from "@octane/sdk";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isAddress, isAddressEqual, type Address } from "viem";
import { Badge, Button, Empty, External, List, PageHeader, Skeleton, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { INDEXER, getMarket } from "@/lib/market";

const SYMBOL: Record<string, string> = { "1874": "USDT", "1337": "USDC" };

/** A maker's statement or a payer's gas spend, paged straight from Arkiv. */
export function History() {
  const params = useSearchParams();
  const makerParam = params.get("maker");
  const payerParam = params.get("payer");
  const maker = makerParam && isAddress(makerParam) ? (makerParam as Address) : undefined;
  const payer = payerParam && isAddress(payerParam) ? (payerParam as Address) : undefined;

  const [fills, setFills] = useState<Fill[] | undefined>();
  const [cursor, setCursor] = useState<number | undefined>();
  const [total, setTotal] = useState<bigint | undefined>();
  const [label, setLabel] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (from: number | undefined, previous: Fill[]) => {
      try {
        const page = await fetchFills(getMarket().reader, {
          indexer: INDEXER,
          ...(maker ? { maker } : {}),
          ...(payer ? { payer } : {}),
          ...(from === undefined ? {} : { cursor: from }),
        });
        setFills([...previous, ...page.fills]);
        setCursor(page.nextCursor);
        setTotal(page.total);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [maker, payer],
  );

  useEffect(() => {
    void load(undefined, []);
    const address = maker ?? payer;
    if (address) void resolveIdentity(address).then((identity) => setLabel(identity.label));
  }, [load, maker, payer]);

  // A payer's spend leaves out fees a merchant covered. A maker earned those either way.
  const coveredForPayer = (fill: Fill) =>
    payer !== undefined && fill.feePayer !== undefined && !isAddressEqual(fill.feePayer, payer);
  const fees = fills?.reduce((sum, fill) => (coveredForPayer(fill) ? sum : sum + fill.fee), 0n) ?? 0n;

  return (
    <section className="animate-rise">
      <PageHeader
        title={maker ? "Maker statement" : "Your gas spend"}
        description={
          <>
            <span className="font-mono">{label}</span> · read straight from Arkiv
          </>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
        <Stat label="Payments" value={total === undefined ? <Skeleton className="h-6 w-8" /> : total.toString()} />
        <Stat label={maker ? "Earned on this page" : "Fees on this page"} value={fills ? money(fees) : <Skeleton className="h-6 w-24" />} />
      </div>

      <div className="mt-6">
        {failed && <p className="mb-3 text-sm text-caution">Couldn't read the history just now.</p>}
        {fills === undefined && !failed && <Skeleton className="block h-16 w-full rounded-xl" />}
        {fills?.length === 0 && <Empty>Nothing yet.</Empty>}
        {fills && fills.length > 0 && (
          <List>
            {fills.map((fill) => (
              <article key={fill.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium tabular-nums">
                    <span>
                      {money(fill.fee)} <span className="text-xs font-normal text-ink-3">{SYMBOL[fill.chainId.toString()] ?? ""}</span>
                    </span>
                    {coveredForPayer(fill) && <Badge>Merchant covered</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">{new Date(Number(fill.ts) * 1000).toLocaleString()}</p>
                </div>
                <External href={explorerTx(Number(fill.chainId), fill.txHash)}>Receipt</External>
              </article>
            ))}
          </List>
        )}
      </div>

      {cursor !== undefined && fills && (
        <Button variant="secondary" onClick={() => void load(cursor, fills)} className="mt-4 w-full">
          Load more
        </Button>
      )}
    </section>
  );
}
