import Link from "next/link";

const LINKS = [
  { href: "/", label: "Wallet" },
  { href: "/board", label: "Market" },
  { href: "/merchant", label: "Merchant" },
  { href: "/makers", label: "Makers" },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-900">
      <nav className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight text-orange-500">
          Octane
        </Link>
        <div className="flex gap-4 text-sm text-zinc-400">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-zinc-100">
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
