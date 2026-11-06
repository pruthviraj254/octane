import Link from "next/link";
import { BUILDER, DISCLOSURE_URL, REPO_URL } from "@/lib/site";
import { Mark } from "./nav";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Wallet", href: "/" },
      { label: "Market", href: "/board" },
      { label: "Merchant", href: "/merchant" },
      { label: "Makers", href: "/makers" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Data on Arkiv", href: "/arkiv" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Source code", href: REPO_URL },
      { label: "AI usage", href: DISCLOSURE_URL },
    ],
  },
];

function FooterLink({ label, href }: { label: string; href: string }) {
  const className = "text-sm text-ink-2 transition-colors hover:text-ink";
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-10 sm:px-6 md:pb-10 md:pt-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_2fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-tight [font-family:var(--font-display)]">
              <Mark className="h-[22px] w-[22px] text-accent" />
              Octane
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              An open gas market. No gas token needed; one fee in stablecoins.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h2 className="text-[13px] text-ink-3">{column.title}</h2>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <FooterLink {...link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-5 text-[13px] text-ink-3">
          <p>
            Built by{" "}
            <a href={BUILDER.links[0]?.href} target="_blank" rel="noreferrer" className="text-ink-2 transition-colors hover:text-ink">
              {BUILDER.name}
            </a>{" "}
            at ETHGlobal Mumbai · MIT license
          </p>
          <p>Testnet only. Test tokens have no real value.</p>
        </div>
      </div>
    </footer>
  );
}
