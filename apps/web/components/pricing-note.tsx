import { TriangleAlert } from "lucide-react";

/** How an agent's price moves, in plain terms, with the formula the makers really run. */
export function PricingNote() {
  return (
    <aside data-testid="pricing-note" className="rounded-2xl border border-caution/30 bg-caution-soft p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-caution">
        <TriangleAlert size={15} aria-hidden />
        How AI agent prices move
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Agents reprice about every 10 seconds. A quote leaves the board 30 seconds after its last refresh, so a price on this page is never stale.
      </p>
      <p className="mt-3 overflow-x-auto rounded-xl bg-canvas/50 px-3 py-2.5 font-mono text-[13px] whitespace-nowrap text-caution">
        fee = gas cost × (1 + AI buffer) + margin + low-tank charge
      </p>
      <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-ink-3">
        <li>Gas cost comes from Whitechain's live gas price and the WBT/USDT pool.</li>
        <li>The AI only picks the buffer, from 0 to 50%. Code does the rest.</li>
        <li>Every fee stays between 0.065 and 0.50 USDT, whoever sets it.</li>
        <li>A maker with no AI agent skips all of this. Its rate never moves until its owner changes it.</li>
        <li>An owner can override their agent with a fixed price at any time, then hand back to the formula.</li>
      </ul>
    </aside>
  );
}
