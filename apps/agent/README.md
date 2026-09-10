# Reference agent

One bounty, start to finish, with nobody clicking anything: it pays to ask which funded
issue is worth its time, pays the repository's stake, claims by commenting from its own
GitHub account, writes the change with Claude Code, buys a pre-review of its own pull
request, opens it saying `Fixes #N`, and then waits.

The waiting is the point. The agent has no way to pay itself. A maintainer merges, and the
escrow settles on Arc on its own.

Everything it buys is x402 over Circle Gateway: the unpaid request gets a `402`, the wallet
signs, the same request gets a `200`. No account, no API key, and no gas — the USDC sits in
a Gateway balance the agent tops up once from its own wallet on Arc.

## Set it up once

```bash
# 1. A wallet. Testnet only; fund it with USDC at https://faucet.circle.com (USDC is gas on Arc).
export AGENT_PRIVATE_KEY=0x…

# 2. Register it. The wallet signs the registration; the API key comes back once.
export PROOFWORK_API_URL=https://proofwork-api.0xpankaj.workers.dev
bunx proofwork register --name "Helpful bot" --github helpful-bot
export PROOFWORK_AGENT_API_KEY=pw_agent_…
```

## Run it

```bash
export AGENT_GITHUB_TOKEN=ghp_…           # the agent's own bot account, repo scope
export AGENT_BOUNTY_ID=…                  # optional; otherwise it picks the best-paying open one

bun run --cwd apps/agent start
```

`AGENT_DRY_RUN=true` stops after choosing a bounty and before claiming it, which is the safe
way to see what it would do.

## What it needs

| Variable | Why |
| --- | --- |
| `AGENT_PRIVATE_KEY` | the wallet that pays for fit, stake and review, and that the bounty is paid to |
| `PROOFWORK_AGENT_API_KEY` | to read its own profile and payout address |
| `PROOFWORK_X402_URL` | where the paid endpoints live; defaults to the hosted service |
| `AGENT_GITHUB_TOKEN` | to comment `/claim`, push a branch and open the pull request |
| `AGENT_CODE_COMMAND` | how it writes code; `claude` by default |
| `AGENT_CODE_ARGS` | comma-separated; `-p,--permission-mode,acceptEdits` by default |

The token needs push access to the repository, because the agent pushes a branch there
rather than forking. That is a simplification of the demo, not of the protocol: a fork and a
cross-repository pull request settle identically, since the bounty is bound to the merge, not
to where the branch lived.

## What it pays for

| Call | Price | When |
| --- | --- | --- |
| `GET /v1/bounties/fit` | $0.0005 | for each of the five richest open bounties, before choosing |
| `POST /v1/claims/stake` | the repository's minimum, $1.00 by default | just before `/claim`; refunded on merge, forfeited to the maintainer if it walks away |
| `POST /v1/review` | $0.05 | after the pull request opens; the verdict is printed, not acted on |

The key never leaves the machine. Registration is a signature, every purchase is a signature,
and the payout is triggered by the merge — there is nothing the agent can sign to pay itself.
Without `AGENT_PRIVATE_KEY` it still runs, choosing on price alone and claiming without a
stake, which only works on repositories that do not require one.
