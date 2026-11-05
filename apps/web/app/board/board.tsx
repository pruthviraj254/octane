"use client";

import { getQuotes, resolveIdentity, type BoardQuote, type Chain } from "@octane/sdk";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { getMarket } from "@/lib/market";

const POLL_MS = 2_000;
const BLOCK_SECONDS = 2n;

interface Row extends BoardQuote {
  label: string;
}

type Status = "loading" | "live" | "offline";

const MARKETS: { chain: Chain; title: string; symbol: string }[] = [
  { chain: "whitechain", title: "Whitechain Sepolia", symbol: "USDT" },
  { chain: "ef-devnet", title: "EF alt-mempool devnet", symbol: "USDC" },
];

export function Board() {
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Live gas market</h1>
      <p className="mt-1 text-sm text-zinc-400">Read straight from Arkiv. A maker that stops refreshing leaves within 30s.</p>
      {MARKETS.map((market) => (
        <Market key={market.chain} {...market} />
      ))}
    </section>
  );
}

function Market({ chain, title, symbol }: { chain: Chain; title: string; symbol: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [block, setBlock] = useState(0n);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    // Expiry emits no event, so the board asks again every block.
    const poll = async () => {
      try {
        const board = await getQuotes(getMarket(), chain);
        const labelled = await Promise.all(
          board.quotes.map(async (entry) => ({ ...entry, label: (await resolveIdentity(entry.quote.maker)).label })),
        );
        if (stopped) return;
        setRows(labelled);
        setBlock(board.blockNumber);
        setStatus("live");
      } catch {
        // One failed poll says little; the next block tries again.
        if (!stopped) setStatus("offline");
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [chain]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium text-zinc-200">
          {title} <span className="text-sm text-zinc-500">· pay in {symbol}</span>
        </h2>
        <StatusPill status={status} />
      </div>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <QuoteCard key={row.key} row={row} block={block} best={index === 0} symbol={symbol} />
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 p-6 text-center text-zinc-400">
            {status === "loading" ? "Reading the board…" : "No live quotes right now."}
          </p>
        )}
      </div>
    </div>
  );
}

function QuoteCard({ row, block, best, symbol }: { row: Row; block: bigint; best: boolean; symbol: string }) {
  const remaining = block === 0n ? 0n : (row.expiresAt - block) * BLOCK_SECONDS;
  const seconds = remaining > 0n ? Number(remaining) : 0;

  return (
    <article
      className={`flex items-center justify-between gap-4 rounded-2xl border p-5 ${
        best ? "border-orange-500/70 bg-orange-500/5" : "border-zinc-800"
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium capitalize">
          {row.style}
          {best && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-black normal-case">Best</span>}
        </p>
        <p className="truncate font-mono text-sm text-zinc-400">{row.label}</p>
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums">
          {formatUnits(row.quote.fee, 6)} {symbol}
        </p>
        <p className="text-sm tabular-nums text-zinc-400">refreshes or leaves in {seconds}s</p>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: Status }) {
  const text = { loading: "Connecting", live: "Live", offline: "Reconnecting" }[status];
  const dot = status === "live" ? "bg-emerald-400" : "bg-amber-400";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-zinc-800 px-3 py-1 text-sm text-zinc-300">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}
