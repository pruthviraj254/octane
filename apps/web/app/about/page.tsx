import { explorerTx } from "@octane/sdk";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HowItWorks } from "@/components/how-it-works";
import { Card, Detail, External, Page, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { BUILDER, DISCLOSURE_URL, REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About · Octane",
  description: "An open gas market where makers compete to pay your gas, and you pay one fee in stablecoins.",
};

const RELAY_ADDRESS = "0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf";

const PRINCIPLES = [
  {
    title: "No operator",
    body: "Live prices sit on Arkiv, a public database. Anyone can read them, and anyone can post their own.",
  },
  {
    title: "No shared treasury",
    body: "Each maker pays gas from its own wallet or its own staked paymaster, so there's no central pot to drain.",
  },
  {
    title: "AI decides, contracts enforce",
    body: "An AI picks a bounded risk buffer. Code sets the price inside hard limits, and you always sign the fee.",
  },
  {
    title: "Reputation anyone can check",
    body: "Scores come from public journals and chain data, and one command reproduces them.",
  },
];

const AUDIENCE = [
  {
    title: "People",
    body: "Pay in plain words, in English or Hinglish, from a built-in wallet or your own browser wallet.",
  },
  {
    title: "AI agents",
    body: "Check prices, pay people and run gas auctions through an MCP server, holding only stablecoins.",
  },
  {
    title: "Makers",
    body: "Put spare WBT or ETH to work and earn a fee. Set your own rate, or let an AI agent price for you.",
  },
  {
    title: "Merchants",
    body: "Take stablecoin payments, and cover the fee for your customers if you choose.",
  },
];

const PARTNERS = [
  { title: "Arkiv", body: "Live quotes, bids, fills and maker reputation.", href: "https://arkiv.network" },
  { title: "Swarm", body: "Each maker's public trading journal.", href: "https://www.ethswarm.org" },
  { title: "Whitechain", body: "USDT payments that makers relay and pay the gas for.", href: "https://whitechain.io" },
  { title: "Ethereum Foundation", body: "Frame transactions on the alternative mempool.", href: "https://docs.altmempool.wtf" },
];

const PROOF = [
  { label: "The verified relay contract", href: `https://explorer.testnet.whitechain.io/address/${RELAY_ADDRESS}` },
  {
    label: "A USDT payment from a public-site wallet",
    href: explorerTx(1874, "0x7e1a6735bbe61745a1241ca80056b1b2c6433a51577770abdbda1fdf5d90887b"),
  },
  {
    label: "A USDC payment with a staked paymaster",
    href: explorerTx(1337, "0x5444b38ad2153164f8e4e05c1692dcd4e199938d422d40cceaf13d5a93440ee4"),
  },
  {
    label: "8 people paid in one frame transaction",
    href: explorerTx(1337, "0x75cd006896b51874572cf7051f16ef7a707566c18ce7d58a71fa9bd3444eef68"),
  },
];

const LIMITS = [
  "Octane runs on testnets only, and the contracts haven't been audited.",
  "The makers on this site all run on one server, so it's a demo of an open market, not yet a spread-out one.",
  "A new wallet needs its first test tokens sent to it.",
  "Browser wallets can't sign frame transactions yet, so USDC needs the built-in wallet.",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <Card className="h-full p-5">
      <h3 className="text-[15px] font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
    </Card>
  );
}

export default function AboutPage() {
  return (
    <Page>
      <PageHeader
        title={
          <>
            About <em>Octane.</em>
          </>
        }
        description="An open gas market. Makers compete to pay your gas, and you pay one fee in stablecoins, inside the same transaction."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gas tokens you need" value="0" hint="Stablecoins only" />
        <Stat label="Chains" value="2" hint="Whitechain and EF devnet" />
        <Stat label="Prices refresh every" value="~10s" hint="Read straight from Arkiv" />
        <Stat label="A stale price is gone in" value="30s" hint="With no cleanup" />
      </div>

      <Section title="The problem">
        <Card className="p-5 sm:p-6">
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">
            Stablecoins are meant to work like money, but every chain makes you hold a second token just to move them. With 100 USDT and no
            gas token, you can't send a cent. AI agents have it worse, because they'd need a gas balance topped up on every chain they use.
          </p>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
            The usual fix puts one company's relayer and one shared pool of funds in the middle. Octane replaces that with an open market:
            anyone with spare gas tokens can compete to carry your payment.
          </p>
        </Card>
      </Section>

      <Section title="How a payment works">
        <HowItWorks />
      </Section>

      <Section title="What makes it different">
        <div className="grid gap-3 sm:grid-cols-2">
          {PRINCIPLES.map((item) => (
            <Tile key={item.title} {...item} />
          ))}
        </div>
      </Section>

      <Section title="Who it's for">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map((item) => (
            <Tile key={item.title} {...item} />
          ))}
        </div>
      </Section>

      <Section title="Two ways to settle, one market">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-[15px] font-medium">Whitechain Sepolia</h3>
            <dl className="mt-2 divide-y divide-line">
              <Detail label="You pay in">USDT</Detail>
              <Detail label="You sign">An EIP-3009 authorisation</Detail>
              <Detail label="Gas comes from">The maker's own wallet</Detail>
              <Detail label="Works with">Built-in or browser wallet</Detail>
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-medium">EF alt-mempool devnet</h3>
            <dl className="mt-2 divide-y divide-line">
              <Detail label="You pay in">USDC</Detail>
              <Detail label="You sign">An EIP-8141 frame transaction</Detail>
              <Detail label="Gas comes from">The maker's staked paymaster</Detail>
              <Detail label="Works with">Built-in wallet</Detail>
            </dl>
          </Card>
        </div>
      </Section>

      <Section title="Built with">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARTNERS.map((partner) => (
            <Card key={partner.title} className="flex h-full flex-col p-5">
              <h3 className="text-[15px] font-medium">{partner.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-2">{partner.body}</p>
              <div className="mt-3">
                <External href={partner.href}>Visit</External>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="See it on chain">
        <Card className="p-5">
          <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {PROOF.map((item) => (
              <li key={item.href}>
                <External href={item.href}>{item.label}</External>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <div className="mt-12 grid gap-3 lg:grid-cols-2">
        <section>
          <SectionTitle>Current limits</SectionTitle>
          <Card className="h-full p-5">
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-ink-2 marker:text-ink-3">
              {LIMITS.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </Card>
        </section>
        <section>
          <SectionTitle>The builder</SectionTitle>
          <Card className="h-full p-5">
            <h3 className="text-[15px] font-medium">{BUILDER.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
              Octane was designed and built at ETHGlobal Mumbai in November 2026, with heavy help from Claude Code. The source is open under
              the MIT license.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {BUILDER.links.map((link) => (
                <External key={link.href} href={link.href}>
                  {link.label}
                </External>
              ))}
              <External href={REPO_URL}>Source code</External>
              <External href={DISCLOSURE_URL}>What AI wrote</External>
            </div>
          </Card>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
        <Link
          href="/"
          className="shine inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-canvas transition-colors hover:bg-accent-bright"
        >
          Try a payment
          <ArrowRight size={15} aria-hidden />
        </Link>
        <Link href="/faq" className="text-sm text-ink-2 transition-colors hover:text-ink">
          Read the FAQ
        </Link>
      </div>
    </Page>
  );
}
