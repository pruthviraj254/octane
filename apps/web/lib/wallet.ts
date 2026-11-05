import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const KEY = "octane.wallet.key";

/**
 * The embedded wallet: a key that lives only in this browser, so a payer never sees a seed
 * phrase. Testnet only. A real wallet would keep it in a passkey-protected store.
 */
export function loadWallet() {
  let key: Hex | null = null;
  try {
    key = localStorage.getItem(KEY) as Hex | null;
  } catch {
    // Storage can be blocked. The wallet still works for this visit.
  }
  if (!key) {
    key = generatePrivateKey();
    try {
      localStorage.setItem(KEY, key);
    } catch {
      // Same as above.
    }
  }
  return { key, account: privateKeyToAccount(key) };
}
