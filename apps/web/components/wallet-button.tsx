"use client";

import { LogOut, Wallet as WalletIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { useWalletSession, type BrowserWallet } from "@/lib/wallet-session";
import { EASE } from "./providers";

const WALLET_REJECTED = 4001;

function friendly(error: unknown): string {
  if ((error as { code?: number }).code === WALLET_REJECTED) return "You declined in your wallet, so nothing changed.";
  return error instanceof Error ? error.message : "The wallet didn't connect.";
}

/** Connects a browser wallet, or shows the one in use. */
export function WalletButton() {
  const { connected, disconnect } = useWalletSession();
  const [open, setOpen] = useState(false);

  if (connected) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-line bg-surface/70 py-1 pl-3 pr-1 text-xs backdrop-blur-md" data-testid="wallet-connected">
        <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
        <span className="ml-1 tabular-nums text-ink">{shortAddress(connected.address)}</span>
        <button
          type="button"
          onClick={disconnect}
          aria-label={`Disconnect ${connected.wallet.name}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-raised hover:text-ink"
        >
          <LogOut size={13} aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shine rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-canvas transition-colors hover:bg-accent-bright"
      >
        Connect wallet
      </button>
      <AnimatePresence>{open && <ConnectDialog onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { wallets, connect } = useWalletSession();
  const [busy, setBusy] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [onClose]);

  async function choose(wallet: BrowserWallet) {
    setBusy(wallet.id);
    setProblem(undefined);
    try {
      await connect(wallet);
      onClose();
    } catch (error) {
      setProblem(friendly(error));
      setBusy(undefined);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-end justify-center bg-canvas/70 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.35, ease: EASE }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-line-strong bg-surface p-5 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.95)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight [font-family:var(--font-display)]">Connect a wallet</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">You'll only sign. Makers send the transaction, so you don't need a gas token.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-3 transition-colors hover:text-ink">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              disabled={busy !== undefined}
              onClick={() => void choose(wallet)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line px-3.5 py-3 text-left text-sm font-medium transition-colors hover:border-line-strong hover:bg-raised disabled:opacity-50"
            >
              {wallet.icon ? (
                // Wallets announce their own icon as a data URI, so next/image has nothing to fetch.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.icon} alt="" className="h-7 w-7 rounded-lg" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-raised text-ink-2">
                  <WalletIcon size={15} aria-hidden />
                </span>
              )}
              <span className="flex-1">{wallet.name}</span>
              {busy === wallet.id && <span className="text-xs text-ink-3">Check your wallet</span>}
            </button>
          ))}
          {wallets.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm leading-relaxed text-ink-3">
              No browser wallet found. Install{" "}
              <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                MetaMask
              </a>{" "}
              and reload, or keep using the built-in wallet.
            </p>
          )}
        </div>
        {problem && <p className="mt-3 text-[13px] leading-relaxed text-caution">{problem}</p>}
      </motion.div>
    </motion.div>
  );
}
