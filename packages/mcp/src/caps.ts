import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

interface Spend {
  day: string;
  spent: string;
}

/**
 * Spending limits for one agent. These are enforced here, off-chain. The onchain limit is
 * the maximum fee the agent signs for each payment.
 */
export class SpendCaps {
  private readonly file: URL;

  constructor(
    readonly maxFee: bigint,
    readonly dailyCap: bigint,
    dataDir = new URL("../data/", import.meta.url),
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = new URL("spend.json", dataDir);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  spentToday(): bigint {
    if (!existsSync(this.file)) return 0n;
    const spend = JSON.parse(readFileSync(this.file, "utf8")) as Spend;
    return spend.day === this.today() ? BigInt(spend.spent) : 0n;
  }

  /** Refuses before anything is signed. Counts the worst case: the amount plus the highest fee. */
  check(amount: bigint): void {
    const worstCase = this.spentToday() + amount + this.maxFee;
    if (worstCase > this.dailyCap) {
      throw new Error(`this would pass the agent's daily cap of ${this.dailyCap} base units`);
    }
  }

  record(amount: bigint): void {
    const spend: Spend = { day: this.today(), spent: (this.spentToday() + amount).toString() };
    writeFileSync(this.file, JSON.stringify(spend));
  }
}
