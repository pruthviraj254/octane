import { eq } from "@arkiv-network/sdk/query";
import { addr } from "@arkiv-network/sdk/schema";
import { QUOTE_LIFETIME, QuoteEntity, quoteValues, type ArkivReader, type ArkivWriter, type Quote, type WriteResult } from "@octane/sdk";
import type { Address, Hex } from "viem";

export interface StandingQuote {
  quote: Quote;
  sig: Hex;
  style: string;
  seq: bigint;
}

const slot = (chainId: bigint, token: string) => `${chainId}:${token.toLowerCase()}`;

/**
 * Keeps one live board entry per chain and token. Each refresh is a single atomic transaction,
 * and what exists is read from Arkiv rather than remembered, so a restart or an expired entity
 * needs no special handling.
 */
export class QuoteBook {
  constructor(
    private readonly reader: ArkivReader,
    private readonly writer: ArkivWriter,
    private readonly maker: Address,
  ) {}

  private async live() {
    const page = await this.reader
      .select({ $key: true, chainId: true, token: true })
      .from(QuoteEntity)
      .where(eq("maker", addr(this.maker)))
      .ownedBy(this.maker)
      .limit(50)
      .fetch();
    return page.entities.map((row) => ({
      key: row.$key as Hex,
      slot: slot(row.chainId.value, row.token.value),
    }));
  }

  async refresh(entries: readonly StandingQuote[]): Promise<WriteResult> {
    const live = await this.live();
    const creates = [];
    const patches = [];
    const extensions = [];
    const used = new Set<Hex>();

    for (const { quote, sig, style, seq } of entries) {
      const values = quoteValues(quote, sig, style, seq);
      const existing = live.find((entity) => entity.slot === slot(quote.chainId, quote.token));
      if (existing) {
        used.add(existing.key);
        patches.push({ schema: QuoteEntity, entityKey: existing.key, set: values });
        extensions.push({ entityKey: existing.key, expiration: QUOTE_LIFETIME });
      } else {
        creates.push({ schema: QuoteEntity, values, expiration: QUOTE_LIFETIME });
      }
    }

    // A crash mid-create can leave a second entity for one slot. Exactly one should remain.
    const deletes = live.filter((entity) => !used.has(entity.key)).map((entity) => ({ entityKey: entity.key }));
    return this.writer.submit({ creates, patches, extensions, deletes });
  }

  /** Leaves the board at once: clean shutdown, low inventory or a shock regime. */
  async withdraw(): Promise<WriteResult | undefined> {
    const live = await this.live();
    if (live.length === 0) return undefined;
    return this.writer.submit({ deletes: live.map((entity) => ({ entityKey: entity.key })) });
  }
}
