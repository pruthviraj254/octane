"use client";

import { whitechainSepolia } from "@octane/sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, numberToHex, type Address, type Hex, type LocalAccount } from "viem";
import { toAccount, type PrivateKeyAccount } from "viem/accounts";
import { loadWallet } from "./wallet";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

export interface BrowserWallet {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

interface Connected {
  wallet: BrowserWallet;
  address: Address;
  account: LocalAccount;
}

const REMEMBERED = "octane.wallet.connected";
const CHAIN_NOT_ADDED = 4902;

const WHITECHAIN_NETWORK = {
  chainId: numberToHex(whitechainSepolia.id),
  chainName: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.whitechain.io"],
  blockExplorerUrls: ["https://explorer.testnet.whitechain.io"],
};

function remembered(): string | null {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(id: string | null): void {
  try {
    if (id) localStorage.setItem(REMEMBERED, id);
    else localStorage.removeItem(REMEMBERED);
  } catch {
    // Storage can be blocked. The connection still works for this visit.
  }
}

/** Wallets refuse to sign typed data for a chain other than the one they're on. */
async function useWhitechain(provider: Eip1193Provider): Promise<void> {
  const chainId = WHITECHAIN_NETWORK.chainId;
  if ((await provider.request({ method: "eth_chainId" })) === chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== CHAIN_NOT_ADDED) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [WHITECHAIN_NETWORK] });
  }
}

/**
 * A browser wallet in the shape the SDK signs with. A payer only ever signs typed data here: the
 * maker sends the transaction, so the wallet needs no gas token and sends nothing itself.
 */
function connectedAccount(provider: Eip1193Provider, address: Address): LocalAccount {
  const client = createWalletClient({ transport: custom(provider) });
  return toAccount({
    address,
    signMessage: ({ message }) => client.signMessage({ account: address, message }),
    signTransaction: () => Promise.reject(new Error("Octane never asks a payer to sign a transaction.")),
    signTypedData: async (typedData) => {
      await useWhitechain(provider);
      const request = typedData as unknown as Parameters<typeof client.signTypedData>[0];
      // A bigint chain id reaches the wallet as text, and wallets differ on how they hash that.
      const domain = { ...request.domain, chainId: Number(request.domain?.chainId) };
      return client.signTypedData({ ...request, domain, account: address });
    },
  });
}

/** Finds installed wallets through EIP-6963, so several can sit side by side. */
function useBrowserWallets(): BrowserWallet[] {
  const [wallets, setWallets] = useState<BrowserWallet[]>([]);

  useEffect(() => {
    const announced = (event: Event) => {
      const { info, provider } = (event as CustomEvent<{ info: { rdns: string; name: string; icon?: string }; provider: Eip1193Provider }>).detail;
      setWallets((known) =>
        known.some((wallet) => wallet.id === info.rdns)
          ? known
          : [...known, { id: info.rdns, name: info.name, ...(info.icon ? { icon: info.icon } : {}), provider }],
      );
    };
    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Older wallets only set window.ethereum.
    const legacy = setTimeout(() => {
      const provider = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      if (!provider) return;
      setWallets((known) => (known.length > 0 ? known : [{ id: "injected", name: "Browser wallet", provider }]));
    }, 400);

    return () => {
      window.removeEventListener("eip6963:announceProvider", announced);
      clearTimeout(legacy);
    };
  }, []);

  return wallets;
}

interface WalletSession {
  /** Undefined until the browser has loaded. */
  account: LocalAccount | undefined;
  address: Address | undefined;
  /** Only the built-in wallet has a key to hand, so only it can sign frame transactions. */
  builtIn: { key: Hex; account: PrivateKeyAccount } | undefined;
  connected: Connected | undefined;
  wallets: BrowserWallet[];
  connect: (wallet: BrowserWallet) => Promise<void>;
  disconnect: () => void;
  /** Sends a plain transfer from the connected wallet on Whitechain. */
  sendWbt: (to: Address, value: bigint) => Promise<Hex>;
}

const SessionContext = createContext<WalletSession | undefined>(undefined);

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const wallets = useBrowserWallets();
  const [builtIn, setBuiltIn] = useState<WalletSession["builtIn"]>();
  const [connected, setConnected] = useState<Connected>();
  const restoring = useRef(false);

  useEffect(() => setBuiltIn(loadWallet()), []);

  const adopt = useCallback((wallet: BrowserWallet, address: Address) => {
    setConnected({ wallet, address, account: connectedAccount(wallet.provider, address) });
    remember(wallet.id);
  }, []);

  const connect = useCallback(
    async (wallet: BrowserWallet) => {
      const [address] = (await wallet.provider.request({ method: "eth_requestAccounts" })) as Address[];
      if (!address) throw new Error("The wallet didn't share an address.");
      await useWhitechain(wallet.provider);
      adopt(wallet, address);
    },
    [adopt],
  );

  const disconnect = useCallback(() => {
    setConnected(undefined);
    remember(null);
  }, []);

  // Comes back to the same wallet after a reload, without a popup.
  useEffect(() => {
    const id = remembered();
    const wallet = wallets.find((candidate) => candidate.id === id);
    if (!wallet || restoring.current) return;
    restoring.current = true;
    void (wallet.provider.request({ method: "eth_accounts" }) as Promise<Address[]>)
      .then(([address]) => {
        if (address) adopt(wallet, address);
      })
      .catch(() => undefined);
  }, [wallets, adopt]);

  useEffect(() => {
    const wallet = connected?.wallet;
    if (!wallet) return;
    const changed = (accounts: Address[]) => {
      const [address] = accounts;
      if (address) adopt(wallet, address);
      else disconnect();
    };
    wallet.provider.on?.("accountsChanged", changed);
    return () => wallet.provider.removeListener?.("accountsChanged", changed);
  }, [connected?.wallet, adopt, disconnect]);

  const sendWbt = useCallback(
    async (to: Address, value: bigint) => {
      if (!connected) throw new Error("Connect a wallet first.");
      await useWhitechain(connected.wallet.provider);
      const client = createWalletClient({ chain: whitechainSepolia, transport: custom(connected.wallet.provider) });
      return client.sendTransaction({ account: connected.address, to, value });
    },
    [connected],
  );

  const value = useMemo<WalletSession>(() => {
    const account = connected?.account ?? builtIn?.account;
    return { account, address: account?.address, builtIn, connected, wallets, connect, disconnect, sendWbt };
  }, [builtIn, connected, wallets, connect, disconnect, sendWbt]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useWalletSession(): WalletSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useWalletSession needs WalletSessionProvider");
  return session;
}
