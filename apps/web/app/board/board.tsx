"use client";

import { WHITECHAIN_USDT, fetchBoard, resolveIdentity, type BoardQuote } from "@octane/sdk";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { getReader, isTrustedSettlement } from "@/lib/arkiv";

const POLL_MS = 2_000;
const BLOCK_SECONDS = 2n;

interface Row extends BoardQuote {
  label: string;
}

type Status = "loading" | "live" | "offline";

const now = () => BigInt(Math.floor(Date.now() / 1000));

export function Board() {
  const [rows, setRows] = useState<Row[]>([]);
  const [block, setBlock] = useState(0n);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    // Expiry emits no event, so the board asks again every block.
    const poll = async () => {
      try {
        const board = await fetchBoard(getReader(), {
          chainId: 1874n,
          token: WHITECHAIN_USDT,
          now: now(),
          isTrustedSettlement,
        });
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
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Live gas market</h1>
          <p className="mt-1 text-sm text-zinc-400">Whitechain Sepolia · pay in USDT · read straight from Arkiv</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-8 space-y-3">
        {rows.map((row, index) => (
          <QuoteCard key={row.key} row={row} block={block} best={index === 0} />
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 p-8 text-center text-zinc-400">
            {status === "loading" ? "Reading the board…" : "No live quotes right now."}
          </p>
        )}
      </div>
    </section>
  );
}

function QuoteCard({ row, block, best }: { row: Row; block: bigint; best: boolean }) {
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
          {best && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-black">Best</span>}
        </p>
        <p className="truncate font-mono text-sm text-zinc-400">{row.label}</p>
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums">{formatUnits(row.quote.fee, 6)} USDT</p>
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
