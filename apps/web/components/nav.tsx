"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Wallet" },
  { href: "/board", label: "Market" },
  { href: "/merchant", label: "Merchant" },
  { href: "/makers", label: "Makers" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" aria-hidden>
            <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          </svg>
          Octane
        </Link>
        <div className="flex gap-0.5">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2 py-1.5 text-[13px] transition-colors sm:px-3 ${
                  active ? "bg-raised text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
