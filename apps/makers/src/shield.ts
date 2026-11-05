export interface ShieldLimits {
  /** One payer's minimum gap between jobs. */
  minPayerGapMs: number;
  /** Jobs allowed from everyone combined in one window, which catches sybil bursts. */
  burstLimit: number;
  burstWindowMs: number;
  /** Failed jobs before a payer is refused for a while. */
  strikes: number;
  strikeWindowMs: number;
  blockMs: number;
}

export const DEFAULT_LIMITS: ShieldLimits = {
  minPayerGapMs: 1_000,
  burstLimit: 30,
  burstWindowMs: 10_000,
  strikes: 3,
  strikeWindowMs: 600_000,
  blockMs: 600_000,
};

interface PayerRecord {
  lastJob: number;
  failures: number[];
  blockedUntil: number;
}

/**
 * Decides whether a job is worth simulating. Simulation costs a maker nothing, but a payer can
 * still make a maker lose gas by racing a job, for example by spending its balance elsewhere
 * just after the simulation. Repeat offenders get refused for a while.
 */
export class Shield {
  private readonly payers = new Map<string, PayerRecord>();
  private recent: number[] = [];

  constructor(
    private readonly limits: ShieldLimits = DEFAULT_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  private record(payer: string): PayerRecord {
    const key = payer.toLowerCase();
    let record = this.payers.get(key);
    if (!record) {
      record = { lastJob: 0, failures: [], blockedUntil: 0 };
      this.payers.set(key, record);
    }
    return record;
  }

  /** Returns why a job is refused, or undefined to let it through. */
  refuse(payer: string): string | undefined {
    const now = this.now();
    const record = this.record(payer);
    if (now < record.blockedUntil) return "this payer has too many failed jobs";
    if (now - record.lastJob < this.limits.minPayerGapMs) return "too many jobs from this payer";

    this.recent = this.recent.filter((time) => now - time < this.limits.burstWindowMs);
    if (this.recent.length >= this.limits.burstLimit) return "too many jobs right now";

    this.recent.push(now);
    record.lastJob = now;
    return undefined;
  }

  /** A job that failed simulation or reverted counts against its payer. */
  strike(payer: string): void {
    const now = this.now();
    const record = this.record(payer);
    record.failures = record.failures.filter((time) => now - time < this.limits.strikeWindowMs);
    record.failures.push(now);
    if (record.failures.length >= this.limits.strikes) {
      record.blockedUntil = now + this.limits.blockMs;
      record.failures = [];
    }
  }
}
