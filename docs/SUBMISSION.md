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

Prize selection, when it is made: the Arc tracks are the fit. The Agentic track requires the
Circle Agent Stack specifically, which is not built yet — do not select it until it is.
