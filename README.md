# Proofwork

Escrowed bounties for open-source work, settled in USDC on [Arc](https://arc.io) the moment a
maintainer merges the pull request.

A funder escrows USDC against a GitHub issue and sets aside a share for the maintainer who
will review it. A human or an agent claims the issue and opens a pull request. The merge is
the proof: one transaction pays the contributor, pays the maintainer for the review, and
takes the protocol fee, with sub-second finality and USDC as the gas token.

## It works, and here is the receipt

| | |
| --- | --- |
| Bounty board | https://proofwork-web.0xpankaj.workers.dev |
| API | https://proofwork-api.0xpankaj.workers.dev |
| Escrow contract | [`0x3Bc728A813a7aBe0cB898fd63967525e92353D85`](https://testnet.arcscan.app/address/0x3Bc728A813a7aBe0cB898fd63967525e92353D85) on Arc testnet, source verified |

A real bounty on this repository was funded, claimed, fixed, merged and paid:

- [Issue #1](https://github.com/0x-pankaj/proofwork/issues/1) — $2.00 escrowed, bot comments the terms
- [Pull request #2](https://github.com/0x-pankaj/proofwork/pull/2) — `Fixes #1`, bot comments what merging pays
- [Settlement](https://testnet.arcscan.app/tx/0x7ea90960deeebe2dd0e8f40650a16dc527a254a04637be5eb85e8ef3b9897b5b) — $1.70 to the contributor, $0.30 to the maintainer, $0.06 protocol fee, **one transaction**

Nobody approved a payout. The merge was the approval.

## The loop

1. A funder picks an open issue and escrows USDC. Two signatures from their own wallet:
   `approve`, then `createAndFund`. Proofwork never holds the funder's key.
2. The bot comments the terms on the issue. A contributor — human or agent — comments
   `/claim`. GitHub has already authenticated them, so the comment doubles as proof they
   control the login.
3. They open a pull request whose body says `Fixes #N`. The bot comments what merging pays.
4. A maintainer merges. The merge webhook checks every guard — the pull request closes the
   funded issue, its author holds an active claim, the base branch is the one the repository
   ships from — and only then does the verifier wallet call `settle`.
5. Three transfers, one transaction, a few seconds. The bot posts the receipt.

Repository policy is enforced before work starts, not after: a maintainer decides whether
AI-assisted contributions are welcome, whether they must be disclosed, what an agent stakes
to hold a claim, and how long a claim survives without a pull request.

## Circle products used

| Product | Where |
| --- | --- |
| Arc | The chain. USDC is the gas token; escrow, settlement and refunds all live here. |
| Developer-Controlled Wallets | The verifier wallet that calls `settle`, and the treasury that receives fees. `packages/circle` talks to the API over `fetch` and Web Crypto, so it runs on Cloudflare Workers. |
| Compliance Engine | The payout address is screened before settlement. Without the entitlement, Circle's own transaction screening is the backstop and a denial is handled as a failed settlement. |
| Faucet | Testnet USDC for the deployer and the verifier wallet. |

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

### Deployed on Arc testnet

| | |
| --- | --- |
| `ProofworkJobs` | [`0x3Bc728A813a7aBe0cB898fd63967525e92353D85`](https://testnet.arcscan.app/address/0x3Bc728A813a7aBe0cB898fd63967525e92353D85) |
| Verified | Yes, source published on ArcScan |
| Deployment cost | 0.0456 USDC |
| Fee | 300 bps (3%) |

The address is committed to the repository in the deployment record, so a fresh checkout
talks to the right contract with no configuration.

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
  web/       Next.js 16 on Cloudflare — board, bounty page, funding flow, maintainer settings
  api/       Hono on Cloudflare Workers — GitHub webhooks, REST API, settlement, cron
packages/
  chain/     Networks, addresses, ABIs. The only place with chain configuration.
  contracts/ Foundry: ProofworkJobs, 35 tests, deploy script
  core/      Domain logic with no I/O: state machine, hashing, settlement orchestrator
  db/        Drizzle schema, migrations, Neon client, repositories
  circle/    Circle wallets and compliance over fetch
  github/    App auth, webhook verification, parsers, comment templates
  config/    Shared TypeScript and Biome configuration
```

The settlement orchestrator in `packages/core` has no database, no HTTP and no chain client
in it: everything the outside world does is behind an interface. That is what makes the code
path that moves money testable end to end without a network.

## Local development

```bash
bun install
bun run check              # typecheck, lint and unit tests across the monorepo
bun run contracts:test     # forge test

cp .env.example .env       # then fill it in
bun run db:migrate         # apply the schema to Neon
bun run dev:vars           # write .dev.vars for both Workers from .env
```

Running the whole loop against Arc testnet:

```bash
bun run --cwd apps/api dev     # the API on :8787
bun run --cwd apps/web dev     # the web app on :3000
bun run dev:webhooks           # relay GitHub deliveries to the local API
bun run github:sync            # pull installations and repositories into the database
bun run seed:bounty            # fund a real bounty through the API
bun run e2e:testnet            # fund and settle on chain, asserting all three balances
```

Requires Bun 1.2+ and [Foundry](https://getfoundry.sh).

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
