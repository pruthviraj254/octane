# Swarm journals

Each AI maker publishes a public trading journal to Swarm. Arkiv holds the live market, and Swarm holds the long record behind it.

## What lives where

| Data | Where | Why |
|---|---|---|
| Journal files: each quote, regime call and reason, relayed job, and the Arkiv transaction and Whitechain block behind each quote | **Swarm** | Long files people read, not records anyone filters |
| The newest journal's reference | **Arkiv**, `journalRef` on the maker's `octane.maker` entity | So a journal is found by query, not by asking us |

Files are unencrypted JSON, published about every five minutes. Each one holds the previous file's reference in `prev`, so they form a hash-linked chain back to the first. Nothing in them is private.

## One example

| | |
|---|---|
| Maker | Cautious, `0x8B07DcE945641A7032BA44697Fff41ccAD2B12ea` |
| Entity key | `0xa61a5d6533a8b0ec67d4c632c3d1083395d1612a5b2bcd48b1f1041a7a145d45` |
| Field | `journalRef` |
| Swarm reference | `c41d3743c32ad9f7556f0ec3dc897d57f0f41c0dd9ea7453b4d25b9f6bafadd9` |
| Open it | <https://bzz.limo/bzz/c41d3743c32ad9f7556f0ec3dc897d57f0f41c0dd9ea7453b4d25b9f6bafadd9/> |

This is one file in the chain. The profile always points at the newest file, so read `journalRef` from Arkiv for the latest.

## Postage

| | |
|---|---|
| Batch ID | None of our own. We send the all-zero batch ID `0000…0000`, and the gateway stamps the upload itself |
| Who provides it | The public gateway's operator |
| Bee node or service | The public gateway `https://bzz.limo`. We run no Bee node |

This is the main limitation of our Swarm use. We don't control the stamp, so we can't say how long these files will stay retrievable. A batch of our own would fix that, and only `SWARM_BEE_URL` and `SWARM_BATCH_ID` in `.env` would change.

## Code

- Upload and read: [`packages/sdk/src/swarm.ts`](../packages/sdk/src/swarm.ts)
- Publishing loop and the Arkiv update: [`apps/makers/src/publish.ts`](../apps/makers/src/publish.ts)
- Reading the chain back: [`scripts/recompute-fade.ts`](../scripts/recompute-fade.ts)

## Run one upload and one read

```bash
# One upload, straight to the gateway
echo '{"hello":"swarm"}' > note.json
curl -s -X POST "https://bzz.limo/bzz?name=note.json" \
  -H "content-type: application/json" \
  -H "swarm-postage-batch-id: 0000000000000000000000000000000000000000000000000000000000000000" \
  --data-binary @note.json

# One read, with the reference that printed
curl -s "https://bzz.limo/bzz/<reference>/"
```

In the app, `pnpm makers` publishes on its own. `pnpm recompute-fade --maker 0x…` reads a maker's whole chain from Swarm.

## Demo video

The journal link opens at **[timestamp to add after recording]**, from the Makers page.

## What got in our way

- Getting a postage batch at a hackathon took more than we had time for, so we used a public gateway. Its upload worked with no batch ID, which we didn't expect from the docs.
- The Swarm docs teach running a Bee node and buying a stamp. We found no documented path for a small app that wants to store a few kilobytes.
- `api.gateway.ethswarm.org` accepted our upload and then timed out on the read, while `bzz.limo` served the same reference. We publish and read through `bzz.limo` for that reason.
- Journals only became useful for reputation once they held machine-readable fields. Old lines had no balance data, and we had to stop treating that as a failure.
