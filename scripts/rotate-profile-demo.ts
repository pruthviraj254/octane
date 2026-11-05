import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, str, u64 } from "@arkiv-network/sdk/schema";
import { ArkivWriter, MakerEntity, arkivReader, arkivWallet, explorerTx, fetchMakerProfile, ARKIV_CHAIN_ID } from "@octane/sdk";
import { createWalletClient, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { rabdi } from "@arkiv-network/sdk/chains";
import { env, envHex, run } from "./lib/env.ts";

/**
 * Shows a planned key rotation on a throwaway profile: the old wallet hands its profile to the
 * new one, and the journal reference and reputation link move with it. Live makers aren't touched.
 */
await run(async () => {
  const accessKey = env("ARKIV_ACCESS_KEY");
  const reader = arkivReader(accessKey);
  const funder = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const chain = rabdi({ accessKey });
  const funding = createWalletClient({ chain, transport: http(), account: funder });

  const oldKey = privateKeyToAccount(generatePrivateKey());
  const newKey = privateKeyToAccount(generatePrivateKey());
  for (const account of [oldKey, newKey]) {
    const hash = await funding.sendTransaction({ to: account.address, value: parseEther("0.005") });
    await reader.waitForTransactionReceipt({ hash });
  }

  const oldWallet = arkivWallet(accessKey, oldKey);
  const oldWriter = new ArkivWriter(reader, oldWallet, oldKey.address);
  const created = await oldWriter.submit({
    creates: [
      {
        schema: MakerEntity,
        expiration: ExpirationTime.fromHours(1),
        values: { maker: addr(oldKey.address), style: str("rotation-demo"), endpoint: str("http://127.0.0.1:0"), journalRef: str("demo"), journalSeq: u64(1n) },
      },
    ],
  });
  const key = created.status === "sent" ? created.createdEntities[0] : undefined;
  if (!key) throw new Error("couldn't create the profile");
  console.log(`profile ${key}, owned by the old wallet`);

  const moved = await oldWriter.submit({ ownershipChanges: [{ entityKey: key, newOwner: newKey.address }] });
  if (moved.status !== "sent") throw new Error("transfer skipped");
  console.log(`transferred ${explorerTx(ARKIV_CHAIN_ID, moved.txHash)}`);

  const newWriter = new ArkivWriter(reader, arkivWallet(accessKey, newKey), newKey.address);
  const claimed = await newWriter.submit({
    patches: [{ schema: MakerEntity, entityKey: key, set: { maker: addr(newKey.address) } }],
  });
  if (claimed.status !== "sent") throw new Error("claim skipped");

  const profile = await fetchMakerProfile(reader, newKey.address);
  console.log(`new wallet now owns it: ${Boolean(profile)}, journal reference kept: ${profile?.journalRef}`);

  let oldWalletBlocked = false;
  try {
    await oldWriter.submit({ deletes: [{ entityKey: key }] });
  } catch {
    oldWalletBlocked = true;
  }
  console.log(`old wallet can no longer touch it: ${oldWalletBlocked}`);
  await newWriter.submit({ deletes: [{ entityKey: key }] });
});
