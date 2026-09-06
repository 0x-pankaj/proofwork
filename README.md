# Proofwork

Escrowed bounties for open-source work, settled in USDC on [Arc](https://arc.io) the moment a
maintainer merges the pull request.

A funder escrows USDC against a GitHub issue and sets aside a share for the maintainer who
will review it. A human or an agent claims the issue and opens a pull request. The merge is
the proof: one transaction pays the contributor, pays the maintainer for the review, and
takes the protocol fee, with sub-second finality and USDC as the gas token.

## Why this exists

Agents made code cheap and review expensive. Open bounty boards are full of listings that
never pay: of 529 open agent bounties surveyed in August 2026, 73% never settled, and only two
settled in the trailing 30 days. Maintainers absorb the review cost of AI-generated pull
requests and are paid nothing for it.

Proofwork prices the three things that are actually scarce: maintainer attention, a verified
outcome, and accountability for wasted review time.

## How the money works

A $200 bounty with a 15% review share, at the default 3% protocol fee:

| Party | Receives | Source |
| --- | --- | --- |
| Contributor | $170.00 | budget, less the review share |
| Maintainer | $30.00 | review share, out of the budget |
| Treasury | $6.00 | protocol fee, paid by the funder on top |

The funder escrows $206.00. On a rejection or after the deadline, the funder gets all $206.00
back. The fee percentage is fixed when the job is funded, so it can never be repriced against
money already escrowed.

## Contracts

`ProofworkJobs` implements [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job escrow in
full, so any ERC-8183 tool or indexer understands a Proofwork bounty, and adds the three-way
settlement the standard does not model.

| Property | Value |
| --- | --- |
| Solidity | 0.8.24, `evm_version = paris` (Arc has no `PUSH0`) |
| Runtime size | 8,907 bytes |
| `settle` gas | ~156,754 |
| Upgradeable | No. Ownership starts on the deployer and moves to a multisig. |
| Payment token | USDC only, set once at construction |

Safety properties covered by the test suite: the budget split never leaves dust, refunds
always return budget and fee together, a fee change cannot reprice a funded job, pausing stops
new money entering but never blocks a refund or a settlement, and a hostile payment token
cannot reenter a payout.

### Deploying to Arc testnet

```bash
cast wallet import proofwork-deployer --interactive   # once, stores an encrypted keystore
# fund the resulting address with testnet USDC at https://faucet.circle.com  (USDC is gas)
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
export TREASURY=0xYourTreasuryAddress
bun run contracts:deploy:testnet
```

The script writes `packages/contracts/deployments/<chainId>.json`, which `packages/chain`
reads, so no address is ever pasted into application code. Verification against ArcScan runs
as part of the same command.

## Repository layout

```
apps/
  web/       Next.js — bounty board, funding flow, maintainer settings
  api/       Hono on Cloudflare Workers — GitHub webhooks, REST API, cron
  x402/      Express — paid endpoints via Circle Nanopayments
  agent/     Reference agent that claims, fixes and gets paid
packages/
  chain/     Networks, addresses, ABIs. The only place with chain configuration.
  contracts/ Foundry: ProofworkJobs, tests, deploy script
  config/    Shared TypeScript and Biome configuration
```

## Local development

```bash
bun install
bun run check              # typecheck, lint and unit tests across the monorepo
bun run contracts:test     # forge test
bun run contracts:build    # forge build, then regenerate the TypeScript ABI
```

Requires Bun 1.2+, Node 22 for the Circle SDKs, and [Foundry](https://getfoundry.sh).

## Network

| | Arc Testnet |
| --- | --- |
| Chain id | 5042002 |
| RPC | https://rpc.testnet.arc.network |
| Explorer | https://testnet.arcscan.app |
| USDC | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Faucet | https://faucet.circle.com |

USDC on Arc is one balance behind two interfaces: an 18-decimal native view used for gas, and
the 6-decimal ERC-20 view used for everything else. Every amount in this codebase is a
6-decimal bigint.

## License

MIT
