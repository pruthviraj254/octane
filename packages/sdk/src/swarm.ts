
export interface JournalFile {
  maker: string;
  /** Position in the chain, starting at 1. */
  seq: number;
  /** The previous file's reference, so the files form a hash-linked chain. */
  prev: string | null;
  from: number;
  to: number;
  lines: Record<string, unknown>[];
}

const REFERENCE = /^[0-9a-f]{64}$/;

/** Uploads one journal file and returns its Swarm reference. Journals are public and unencrypted. */
export async function uploadJournal(beeUrl: string, batchId: string, file: JournalFile): Promise<string> {
  const response = await fetch(`${beeUrl.replace(/\/$/, "")}/bzz?name=journal-${file.seq}.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "swarm-postage-batch-id": batchId },
    body: JSON.stringify(file),
  });
  if (!response.ok) throw new Error(`Swarm upload failed: ${response.status}`);
  const { reference } = (await response.json()) as { reference?: string };
  if (!reference || !REFERENCE.test(reference)) throw new Error("Swarm returned no reference");
  return reference;
}

export async function downloadJournal(beeUrl: string, reference: string): Promise<JournalFile> {
  const response = await fetch(`${beeUrl.replace(/\/$/, "")}/bzz/${reference}/`);
  if (!response.ok) throw new Error(`Swarm download failed: ${response.status}`);
  return (await response.json()) as JournalFile;
}

/** Walks a journal chain back from its newest file, oldest first in the result. */
export async function downloadJournalChain(beeUrl: string, newest: string, maxFiles = 300): Promise<JournalFile[]> {
  const files: JournalFile[] = [];
  let reference: string | null = newest;
  while (reference && files.length < maxFiles) {
    const file: JournalFile = await downloadJournal(beeUrl, reference);
    files.unshift(file);
    reference = file.prev;
  }
  return files;
}

export function swarmLink(reference: string): string {
  return `https://bzz.limo/bzz/${reference}/`;
}


