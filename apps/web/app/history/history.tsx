"use client";

import { explorerTx, fetchFills, resolveIdentity, type Fill } from "@octane/sdk";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { INDEXER, getMarket } from "@/lib/market";

const SYMBOL: Record<string, string> = { "1874": "USDT", "1337": "USDC" };

/** A maker's statement or a payer's gas spend, paged straight from Arkiv. */
export function History() {
  const params = useSearchParams();
  const maker = params.get("maker");
  const payer = params.get("payer");
  const [fills, setFills] = useState<Fill[]>([]);
  const [cursor, setCursor] = useState<number | undefined>();
  const [total, setTotal] = useState<bigint | undefined>();
  const [label, setLabel] = useState("");
  const [failed, setFailed] = useState(false);

  const filter = {
    ...(maker && isAddress(maker) ? { maker: maker as Address } : {}),
    ...(payer && isAddress(payer) ? { payer: payer as Address } : {}),
  };
  const key = `${maker}:${payer}`;

  const load = useCallback(
    async (from: number | undefined, previous: Fill[]) => {
      try {
        const page = await fetchFills(getMarket().reader, {
          indexer: INDEXER,
          ...(maker && isAddress(maker) ? { maker: maker as Address } : {}),
          ...(payer && isAddress(payer) ? { payer: payer as Address } : {}),
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
    const address = filter.maker ?? filter.payer;
    if (address) void resolveIdentity(address).then((identity) => setLabel(identity.label));
    // `filter` is rebuilt each render; `key` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  const spent = fills.reduce((sum, fill) => sum + fill.fee, 0n);

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">{maker ? "Maker statement" : "Your gas spend"}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        <span className="font-mono">{label}</span> · read straight from Arkiv
      </p>

      {total !== undefined && (
        <p className="mt-4 text-zinc-300">
          {total.toString()} {total === 1n ? "payment" : "payments"}. {maker ? "Earned" : "Fees paid"} on this page:{" "}
          <span className="tabular-nums">{formatUnits(spent, 6)}</span>
        </p>
      )}

      <div className="mt-4 space-y-2">
        {fills.map((fill) => (
          <article key={fill.key} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 p-4">
            <div>
              <p className="tabular-nums">
                {formatUnits(fill.fee, 6)} {SYMBOL[fill.chainId.toString()] ?? ""}
              </p>
              <p className="text-sm text-zinc-500">{new Date(Number(fill.ts) * 1000).toLocaleString()}</p>
            </div>
            <a href={explorerTx(Number(fill.chainId), fill.txHash)} target="_blank" rel="noreferrer" className="text-sm text-orange-400 underline">
              Transaction
            </a>
          </article>
        ))}
        {total === 0n && <p className="rounded-xl border border-zinc-800 p-6 text-center text-zinc-400">Nothing yet.</p>}
        {failed && <p className="text-amber-400">Couldn't read the history just now.</p>}
      </div>

      {cursor !== undefined && (
        <button onClick={() => void load(cursor, fills)} className="mt-4 rounded-xl border border-zinc-700 px-5 py-2 text-zinc-300">
          Load more
        </button>
      )}
    </section>
  );
}
