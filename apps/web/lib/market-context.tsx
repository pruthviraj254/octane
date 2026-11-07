"use client";

import { getQuotes, resolveIdentity, type BoardQuote, type Chain } from "@octane/sdk";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMarket } from "./market";

const POLL_MS = 5_000;

export interface Row extends BoardQuote {
  label: string;
}

export interface Snapshot {
  rows: Row[];
  block: bigint;
  status: "loading" | "live" | "offline";
}

const EMPTY: Snapshot = { rows: [], block: 0n, status: "loading" };

/** Asks again every block, because expiry emits no event. One failed read changes nothing. */
function usePolledBoard(chain: Chain): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      // A hidden tab has nobody watching it, so it shouldn't spend read quota.
      if (document.hidden) {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const board = await getQuotes(getMarket(), chain);
        const rows = await Promise.all(
          board.quotes.map(async (entry) => ({ ...entry, label: (await resolveIdentity(entry.quote.maker)).label })),
        );
        if (!stopped) setSnapshot({ rows, block: board.blockNumber, status: "live" });
      } catch {
        if (!stopped) setSnapshot((previous) => ({ ...previous, status: "offline" }));
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [chain]);

  return snapshot;
}

const MarketContext = createContext<Record<Chain, Snapshot>>({ whitechain: EMPTY, "ef-devnet": EMPTY });

/** One live feed for the whole app, so every screen agrees and Arkiv is only asked once. */
export function MarketProvider({ children }: { children: ReactNode }) {
  const whitechain = usePolledBoard("whitechain");
  const devnet = usePolledBoard("ef-devnet");
  const value = useMemo(() => ({ whitechain, "ef-devnet": devnet }), [whitechain, devnet]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export const useMarket = () => useContext(MarketContext);
