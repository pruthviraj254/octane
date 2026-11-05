import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { redactAccessKey } from "@octane/sdk";

export interface JournalLine {
  ts: number;
  maker: string;
  event: string;
  [field: string]: unknown;
}

const dataDir = new URL("../data/", import.meta.url);

/** A public trading journal: one JSON line per decision, later published to Swarm. */
export class Journal {
  private readonly file: URL;
  readonly directory = dataDir;

  constructor(private readonly maker: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = new URL(`${maker}.jsonl`, dataDir);
  }

  read(): JournalLine[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalLine);
  }

  write(event: string, fields: Record<string, unknown> = {}): void {
    const line: JournalLine = { ts: Math.floor(Date.now() / 1000), maker: this.maker, event, ...fields };
    const text = redactAccessKey(JSON.stringify(line, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
    appendFileSync(this.file, `${text}\n`);
    console.log(text);
  }
}
