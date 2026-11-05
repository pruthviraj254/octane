import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, str, u64 } from "@arkiv-network/sdk/schema";
import { MakerEntity, fetchMakerProfile, uploadJournal, type ArkivReader, type ArkivWriter, type JournalFile } from "@octane/sdk";
import type { Address } from "viem";
import type { Journal } from "./journal.ts";

interface PublishState {
  seq: number;
  prev: string | null;
  /** How many journal lines are already on Swarm. */
  published: number;
}

/**
 * Publishes new journal lines to Swarm as a hash-linked file, then records the newest reference
 * in the maker's Arkiv profile, so anyone can find a maker's journal by query.
 */
export class JournalPublisher {
  private readonly stateFile: URL;
  private state: PublishState;

  constructor(
    private readonly maker: Address,
    private readonly style: string,
    private readonly endpoint: string,
    private readonly journal: Journal,
    private readonly reader: ArkivReader,
    private readonly writer: ArkivWriter,
    private readonly beeUrl: string,
    private readonly batchId: string,
  ) {
    this.stateFile = new URL(`${style}.publish.json`, journal.directory);
    this.state = existsSync(this.stateFile)
      ? (JSON.parse(readFileSync(this.stateFile, "utf8")) as PublishState)
      : { seq: 0, prev: null, published: 0 };
  }

  async publish(): Promise<string | undefined> {
    const lines = this.journal.read();
    const fresh = lines.slice(this.state.published);
    if (fresh.length === 0) return undefined;

    const first = fresh[0];
    const last = fresh.at(-1);
    if (!first || !last) return undefined;
    const file: JournalFile = {
      maker: this.maker,
      seq: this.state.seq + 1,
      prev: this.state.prev,
      from: first.ts,
      to: last.ts,
      lines: fresh,
    };
    const reference = await uploadJournal(this.beeUrl, this.batchId, file);

    const profile = await fetchMakerProfile(this.reader, this.maker);
    if (profile) {
      await this.writer.submit({
        patches: [
          {
            schema: MakerEntity,
            entityKey: profile.key,
            set: {
              maker: addr(this.maker),
              style: str(this.style),
              endpoint: str(this.endpoint),
              journalRef: str(reference),
              journalSeq: u64(BigInt(file.seq)),
            },
          },
        ],
        extensions: [{ entityKey: profile.key, expiration: ExpirationTime.fromDays(7) }],
      });
    }

    this.state = { seq: file.seq, prev: reference, published: lines.length };
    writeFileSync(this.stateFile, JSON.stringify(this.state));
    return reference;
  }
}
