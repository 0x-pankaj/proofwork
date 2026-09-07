# ETHOnline 2026 submission copy

The text filled into https://ethglobal.com/events/ethonline2026/project, kept here so it
survives a reload and can be edited in one place.

- **Project name:** Proofwork
- **Category:** Wallet/Payments
- **Emoji:** 💸
- **Demo link:** https://proofwork-web.0xpankaj.workers.dev
- **GitHub repository:** https://github.com/0x-pankaj/proofwork

## Short description

Escrowed USDC bounties that pay the contributor and the reviewer the moment a pull request merges.

## Description

Open-source bounties mostly do not pay. Of 529 open agent bounties surveyed in August 2026, 73% never settled. Agents made code cheap and review expensive, and the maintainer who reviews an AI-generated pull request is paid nothing for it.

Proofwork escrows USDC on Arc against a GitHub issue before anyone starts, and splits it three ways when the work is merged: the contributor, the maintainer who reviewed it, and a protocol fee. The merge is the approval. Nobody signs off on a payout and there is no invoice.

The loop: a funder picks an open issue and escrows USDC from their own wallet (approve, then createAndFund; Proofwork never holds their key). A contributor, human or agent, comments /claim on the issue, which GitHub has already authenticated, so the comment doubles as proof they control the login. They open a pull request whose body says Fixes #N. A maintainer merges. The merge webhook checks that the pull request closes the funded issue, that its author holds an active claim, and that the base branch is the one the repository ships from, and only then does the verifier wallet call settle. Three transfers, one transaction, a few seconds.

Maintainers set their terms before work starts, not after: whether AI-assisted contributions are welcome, whether they must be disclosed, what an agent stakes to hold a claim, and how long a claim survives without a pull request. That is the part every previous bounty board skipped, and it is why a maintainer would list at all.

It is live and it has paid. Issue #1 on the project's own repository was funded, claimed, fixed, merged and settled: $1.70 to the contributor, $0.30 to the reviewing maintainer, $0.06 protocol fee, in a single transaction on Arc testnet.

## How it's made

ProofworkJobs is a Solidity 0.8.24 contract implementing ERC-8183 job escrow in full, plus the three-way settlement the standard does not model. It is deployed and source-verified on Arc testnet at 0x3Bc728A813a7aBe0cB898fd63967525e92353D85, with evm_version set to paris because Arc has no PUSH0. 35 Foundry tests cover the properties that matter: the split never leaves dust, a refund always returns budget and fee together, a fee change cannot reprice a job that is already funded, pausing stops new money entering but never blocks a refund, and a hostile payment token cannot reenter a payout.

The API is Hono on Cloudflare Workers with Drizzle on Neon Postgres. A GitHub delivery is signature-verified, written down, and only then acted on, so a crash mid-handling leaves a record to replay. Settlement is signed by a Circle Developer-Controlled Wallet: the orchestrator lives in a package with no database, no HTTP and no chain client in it, every side effect behind an interface, which is what lets the code path that moves money be tested end to end without a network. The frontend is Next.js 16 on Cloudflare via OpenNext; the funder signs approve and createAndFund in their own wallet with wagmi, and the API only ever hands out calldata and reads the receipt back off chain.

The genuinely hacky part was Cloudflare Workers. Circle's official SDK is axios-based, and axios sets cache: "default" on its requests, which workerd rejects outright with Unsupported cache mode. That surfaced only after a real merge, with the escrow already funded. The fix was to rewrite the Circle client over plain fetch and Web Crypto: the entity secret is RSA-OAEP/SHA-256 encrypted to Circle's public key on every request, exactly as the SDK does it, and the Worker bundle dropped by 50 KB gzipped. Two more bugs that only production could find: a stored fetch called off a class instance throws Illegal invocation on workerd, and an unset Worker variable arrives as an empty string, so a ?? fallback silently turned every API call into a relative one against the frontend.

## Still to fill

- **GitHub repositories** — blocked: ETHGlobal needs authorization to list the repositories,
  which is an OAuth grant only the account owner should give.
- **Images** — screenshots of the board, the bounty timeline and the payout comment.
- **Tech stack, prizes, video, future** — after the demo video is recorded.

Prize selection: select **Arc**. All of a partner's tracks cost one of the three partner-prize
slots, so selecting Arc enters every Arc line at once. Three are open to a Classic entrant —
Best Agentic Economy ($1,667), Best DeFi/Onchain Finance ($1,667), and Launch on Arc Testnet
& Push to Mainnet ($3,500, 1st $2,500). The other two are Continuity-only and unreachable.
Every qualification block repeats "Please be clear what bounty you are submitting for as a
part of your submission" — so name all three explicitly.

"Circle Agent Stack" is marketing shorthand in the prize title, not an SDK: the phrase appears
nowhere in Arc's documentation. The Agentic track's actual ask is "agents that hold wallets,
make payments, manage risk, **settle jobs**" — and the qualification bar is the same three
items as every other Arc line (functional MVP + architecture diagram, video + documentation,
repo link). Two of the three are already in hand.

## Arc partner-prize writeup

The submission form asks three things per partner: how their tools were used, feedback, and
comments. Draft answers below.

### How we used Circle's tools

Arc's own Agentic Economy page ships two flagship sample apps: **arc-escrow** ("AI-powered
work validation and USDC settlement to automate escrow flows") and **arc-nanopayments**
("autonomous AI agent pays for premium API endpoints in USDC fractions using Circle
Nanopayments and the x402 protocol"). Proofwork is both, on the same money — the agent pays
for the endpoints that help it decide what to claim, and the escrow pays it back when the
work merges.

- **Arc** — `ProofworkJobs` implements ERC-8183 job escrow in full plus the three-way
  settlement the standard does not model, deployed and source-verified at
  `0x3Bc728A813a7aBe0cB898fd63967525e92353D85`. Built with `evm_version = paris`, because Arc
  has no PUSH0. 35 Foundry tests cover the money properties: the split never leaves dust, a
  refund returns budget and fee together, a fee change cannot reprice a funded job, pausing
  stops new money entering but never blocks a refund, and a hostile token cannot reenter.
- **USDC** — held as 6-decimal bigints everywhere; the 18-decimal native view is used only for
  gas math, and the two are never summed. On Arc these are one balance seen two ways, which is
  the single easiest thing to get wrong on this chain.
- **Circle Wallets (Developer-Controlled)** — the verifier wallet signs `settle` and
  `giveFeedback`; the treasury wallet receives protocol fees and x402 revenue. Settlement is
  idempotent on the bounty UUID, so a redelivered merge webhook cannot pay twice.
- **Nanopayments / Gateway** — three endpoints priced per call via
  `@circle-fin/x402-batching` against `gateway-api-testnet.circle.com`: bounty fit $0.0005,
  PR review $0.05, claim stake $1.00. The live 402 advertises `GatewayWalletBatched` across 13
  networks including Arc `eip155:5042002`. Fit is priced so an agent can afford to ask about
  every bounty on the board and still spend less than one wasted claim.
- **Compliance Engine** — the payout address is screened before the escrow releases.
- **ERC-8004** — agents register by signing a message with their payout wallet; if they claim
  an identity, `ownerOf` is checked on Arc before it is accepted, so nobody inherits another
  agent's reputation by pasting an id. Merged work writes `giveFeedback` from the verifier
  wallet, tagged `proofwork/merged` — the registry refuses feedback from the agent's own
  owner, and we are not it.

### Feedback

Real friction, in the order we hit it:

- **The Circle SDK cannot run on Cloudflare Workers.** It is axios-based, and axios sets
  `cache: "default"`, which workerd rejects outright with `Unsupported cache mode`. This
  surfaced only after a real merge, with an escrow already funded. We rewrote the client over
  `fetch` + Web Crypto — RSA-OAEP/SHA-256 encrypting the entity secret per request, exactly as
  the SDK does — and the Worker bundle dropped 50 KB gzipped. A first-party Workers-compatible
  build would remove a genuine barrier, since Workers is a common place to put a webhook
  receiver that has to sign a transaction.
- **Nanopayments is testnet-only on every chain**, and Gateway on Arc is testnet-only
  (domain 26). That is fine for a hackathon, but it means a project cannot take the agent
  payment path to mainnet at the same time as its contracts.
- **Agent-wallet spending policies are mainnet-only.** The budget cap is the most compelling
  half of the agentic story — an agent that must earn more than it spends — and it is exactly
  the half that cannot be demonstrated on testnet.
- **`giveFeedback` documents an 8-argument signature** that is easy to get subtly wrong from
  the tutorial alone; a worked example of the `filedUri`/`responseUri` pair would help.

### Comments

Stated plainly, because a judge can check: the escrow path is exercised — issue #1 on our own
repository was funded, claimed, fixed, merged and settled in one transaction, $1.70 to the
contributor, $0.30 to the reviewing maintainer, $0.06 fee. The agent path is built and live
but not yet exercised: the 402s are real and Gateway-backed, and no agent has paid one yet.
The Agent Marketplace listing is **submitted for listing**, not listed — approval is manual
and Circle publishes no turnaround.
