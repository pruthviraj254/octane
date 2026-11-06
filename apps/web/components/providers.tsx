"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { MarketProvider } from "@/lib/market-context";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Moves each card's soft light under the pointer. One listener serves the whole app. */
function useSpotlight() {
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.(".spot");
      if (!(card instanceof HTMLElement)) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
      card.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useSpotlight();
  return (
    <MotionConfig reducedMotion="user">
      <MarketProvider>{children}</MarketProvider>
    </MotionConfig>
  );
}
