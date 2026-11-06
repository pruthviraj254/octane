"use client";

import { Activity, Cpu, Store, Wallet, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarket } from "@/lib/market-context";
import { money } from "@/lib/format";
import { EASE } from "./providers";
import { LiveDot } from "./ui";
import { WalletButton } from "./wallet-button";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Wallet", icon: Wallet },
  { href: "/board", label: "Market", icon: Activity },
  { href: "/merchant", label: "Merchant", icon: Store },
  { href: "/makers", label: "Makers", icon: Cpu },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

function LiveStatus() {
  const { rows, status } = useMarket().whitechain;
  const best = rows[0];
  return (
    <span className="hidden items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs text-ink-2 backdrop-blur-md xl:flex">
      <LiveDot live={status === "live" && rows.length > 0} />
      <span className="tabular-nums">
        {status === "loading" ? "Connecting" : best ? `${rows.length} makers · from ${money(best.quote.fee)}` : status === "offline" ? "Can't reach Arkiv" : "No live makers"}
      </span>
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      <header className="relative z-30">
        <nav className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex w-fit items-center gap-2.5 text-[17px] font-semibold tracking-tight [font-family:var(--font-display)]">
            <Mark className="h-[22px] w-[22px] text-accent" />
            Octane
            <span className="rounded-md border border-line px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wider text-ink-3">Testnet</span>
          </Link>

          <div className="hidden items-center gap-1 rounded-full border border-line bg-surface/70 p-1 backdrop-blur-md md:flex">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${active ? "text-canvas" : "text-ink-2 hover:text-ink"}`}
                >
                  {active && (
                    <motion.span layoutId="nav-pill" transition={{ duration: 0.45, ease: EASE }} className="absolute inset-0 rounded-full bg-ink" />
                  )}
                  <span className="relative">{link.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 justify-self-end">
            <LiveStatus />
            <WalletButton />
          </div>
        </nav>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 rounded-2xl border border-line-strong bg-surface/85 p-1 shadow-[0_18px_50px_-14px_rgb(0_0_0/0.9)] backdrop-blur-xl md:hidden"
      >
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition-colors ${active ? "text-ink" : "text-ink-3"}`}
            >
              {active && <motion.span layoutId="tab-pill" transition={{ duration: 0.4, ease: EASE }} className="absolute inset-0 rounded-xl bg-raised" />}
              <link.icon size={18} className={`relative ${active ? "text-accent" : ""}`} aria-hidden />
              <span className="relative">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
