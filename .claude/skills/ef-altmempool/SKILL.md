---
name: ef-altmempool
description: >
  Local, indexed mirror of the official EF Alternative Mempool docs, the EIP-8141 (frame transactions)
  text, the ERC-8421 draft, and the forshtat workshop/sidecar devnet references. Use for any Path A work:
  frame layouts, VERIFY/APPROVE/FRAMEDATALOAD, EXPIRY_VERIFIER, pre_verify, staking (NaiveStakingRegistry),
  storage/opcode rules (STORAGE-0xx, PREFIX-0xx), eth_sendFrameTransaction, admission reports
  (skandha_explorer_getTransaction), devnet endpoints and predeployed USDC, and rejection debugging.
---

# EF alt-mempool reference (EIP-8141 / ERC-8421)

EF publishes no Claude Code plugin or MCP server for this track. This skill indexes their official
sources, mirrored into `refs/` on 2026-11-05. **Read the relevant section before you write code. Don't
answer from memory**, as CLAUDE.md's "Verify, don't guess" requires. Search with `grep -n` and read
by line range. The line numbers below are approximate starting points.

## Files in `refs/`

| File | Source | Use for |
|---|---|---|
| `altmempool-docs-full.txt` (2,269 lines) | https://docs.altmempool.wtf/llms-full.txt | Main reference: concepts, guides, rules, RPC |
| `altmempool-docs-small.txt` | https://docs.altmempool.wtf/llms-small.txt | Compact version of the same docs |
| `eip-8141.md` (1,565 lines) | ethereum/EIPs `EIPS/eip-8141.md` | Normative spec: opcodes, frame modes, constants, canonical mempool |
| `erc-8421-draft.md` (380 lines) | forshtat/ERCs `pr-clean` `ERCS/erc-8421.md` | Alt-mempool rule IDs (draft, so it can differ from the sidecar) |
| `sidecar-devnet-readme.md` | forshtat/mempool-workshop-sidecar `deploy/devnet/devnet-readme.md` | Devnet RPC reference |
| `sidecar-deployments-devnet.md` | forshtat/mempool-workshop-sidecar `deployments/devnet.md` | Canonical devnet addresses |
| `workshop-README.md`, `workshop-AGENTS.md` | forshtat/mempool-workshop | Quickstart steps and agent notes |

**Private keys are redacted** in the sidecar mirrors, because CLAUDE.md says never to commit keys. When
the human needs the shared genesis key, read it from the upstream repo
(`gh api repos/forshtat/mempool-workshop-sidecar/contents/deploy/devnet/genesis.values.env`) at runtime
and never write it into this repo.

## Index of `altmempool-docs-full.txt` (line numbers)

- **Concepts:** Architecture 37 · Entities and stake 101 (definition of staked 138, Staking Registry 149) ·
  Frame transactions and validation prefix 185 (recognized prefixes 230, `pre_verify` 257) ·
  Mempool types 273 · Reputation 324
- **Guides:** Reading admission reports 402 · Choosing a mempool 458 (practical limits 483) ·
  **Public devnet 540** (endpoints 550, funds 570, transfer gas 576, predeployed contracts 594, limitations 600) ·
  Keyed nonces 608 · Quickstart/workshop 729 (AI agent notes 793) · Run the sidecar 799 ·
  **Staking an entity 893** · **Submit a frame transaction 935** (frame limits 984, dry run 1007, gotchas 1014)
- **Use cases:** stateful paymasters 1042
- **Reference:** spec vs implementation differences 1095 · Links 1147 · CLI 1165 · Config 1195 ·
  Explorer API 1256 (rule IDs 1343) · **RPC methods 1377** · Subscriptions 1467
- **Rules:** overview and acceptance algorithm 1531 · ASSOC 1593 · BUDGET 1619 · **Constants 1658** ·
  LIFECYCLE 1698 · LOCAL 1760 · OPCODES 1780 · **PREFIX 1850** (why `pre_verify` 1917) · PROPAGATION 1932 ·
  REPUTATION 1976 · SIGNATURE 2044 · STAKING/SOLVENCY 2070 · **STORAGE 2120** · Glossary 2188

## Index of `eip-8141.md`

Constants 32 (`EXPIRY_VERIFIER` ~40, 327, 338, 968) · Frame transaction 60 · `APPROVE` (0xaa) 740 ·
Introspection 794 (`FRAMEDATALOAD` ~821) · **Mempool 923** · Non-canonical paymasters 1330 · Examples 1336 ·
Security 1501

## Index of `erc-8421-draft.md`

Constants 34 · Staking registry 117 · PREFIX 151 · BUDGET 169 · OPCODES 179 · STORAGE 197 · STAKING 218 ·
SOLVENCY 224 · REPUTATION 230 · LIFECYCLE 274 · Acceptance algorithm 302 · `pre_verify` rationale 337

## Code that isn't mirrored (read upstream, never copy into the repo)

The hackathon requires all project code to be written during the event, so treat workshop code as
reference only. Read it with `gh api repos/forshtat/<repo>/contents/<path> -H "Accept: application/vnd.github.raw"`:
- `forshtat/mempool-workshop`: `contracts/src/SponsorPaymaster.sol`, `ExampleWallet.sol`, `ViolatingWallet.sol`, and the
  `@forshtat/hegota-support` patterns (`HegotaSupport`, `approve(Scope.PAYMENT)`, `sigparam`)
- `forshtat/mempool-workshop-sidecar`: the `eth_sendFrameTransaction` encoder and the admission report
- `forshtat/mempool-workshop-documentation`: source of docs.altmempool.wtf

## Refreshing

The devnet can reset at any time and addresses can change. If something on the devnet disagrees with these
files, re-fetch the source URLs in the table above and tell the human about the mismatch.
