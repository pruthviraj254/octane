import type { ExecuteBatchParameters } from "@arkiv-network/sdk";
import type { Address, Hash } from "viem";
import { getGasPrice } from "viem/actions";
import type { ArkivReader, ArkivWallet } from "./client.ts";

type Batch = Parameters<ArkivWallet["executeBatch"]>[0];

export type WriteResult = { status: "sent"; txHash: Hash; createdEntities: readonly Hash[] } | { status: "skipped" };

/** Arkiv's guidance for Rabdi. Our batches measure far below this, so the floor always wins. */
export function batchGas(operations: number): bigint {
  return 1_000_000n + 400_000n * BigInt(Math.max(operations - 1, 0));
}

function countOperations(batch: Batch): number {
  return (
    (batch.creates?.length ?? 0) +
    (batch.patches?.length ?? 0) +
    (batch.deletes?.length ?? 0) +
    (batch.extensions?.length ?? 0) +
    (batch.ownershipChanges?.length ?? 0)
  );
}

/**
 * The one way a wallet writes to Arkiv. Writes run strictly one at a time, and an earlier
 * unconfirmed transaction makes the next tick skip rather than race for a nonce.
 * A failed write is never resent here: its outcome may be unknown, so the caller reconciles.
 */
export class ArkivWriter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly reader: ArkivReader,
    private readonly wallet: ArkivWallet,
    private readonly address: Address,
  ) {}

  submit(batch: Batch): Promise<WriteResult> {
    const run = this.queue.then(() => this.send(batch));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async send(batch: Batch): Promise<WriteResult> {
    const [latest, pending, gasPrice] = await Promise.all([
      this.reader.getTransactionCount({ address: this.address, blockTag: "latest" }),
      this.reader.getTransactionCount({ address: this.address, blockTag: "pending" }),
      getGasPrice(this.reader),
    ]);
    if (pending !== latest) return { status: "skipped" };

    const { txHash, createdEntities } = await this.wallet.executeBatch(batch as ExecuteBatchParameters, {
      nonce: latest,
      gas: batchGas(countOperations(batch)),
      gasPrice,
    });
    return { status: "sent", txHash, createdEntities };
  }
}
