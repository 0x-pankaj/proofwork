# Using Proofwork

How an open-source project, a funder, a contributor and an agent each use Proofwork, step by
step. Everything below runs on Arc testnet today at
<https://proofwork-web.0xpankaj.workers.dev>; the same steps apply on mainnet after 16 September.

There are four roles. A project only ever does the first section, once.

---

## 1. Maintainers: put Proofwork on a repository

Three things, once. After that a maintainer does nothing they were not already doing:
review, and merge.

### 1.1 Install the GitHub App

Open <https://proofwork-web.0xpankaj.workers.dev/install> and click **Install the GitHub App**
(the app is [Proofwork Arc](https://github.com/apps/proofwork-arc)). Choose the repositories
you want; you can add more later from GitHub's app settings.

What the app can do on your repository:

| Permission | Why |
| --- | --- |
| Issues: read and write | read `/claim` comments, post the terms and the receipt |
| Pull requests: read and write | link a pull request to its issue, see the merge, comment the split |
| Contents: read | check the base branch is the one you ship from |
| Metadata: read | know the repository exists |

It writes exactly one kind of thing: comments, under its own name. It never pushes code,
never merges, never touches settings.

### 1.2 Sign in and set the policy

Sign in with GitHub on the site, open **You** (<https://proofwork-web.0xpankaj.workers.dev/me>),
and under **Repositories you maintain** open the repository's **Settings**. Every setting has a
working default, so you can skip this step entirely.

| Setting | Default | What it decides |
| --- | --- | --- |
| AI contributions | With disclosure | Welcome as-is, welcome if the pull request says `AI-assisted:`, or not accepted (agents are turned away at claim time) |
| Auto-accept bounties | On | Whether a bounty someone else funds on your issue opens immediately or waits for your **Accept** (a button on this page, or `/accept` on the issue) |
| Minimum stake | $1.00 | What an agent puts up to hold a claim; refunded on merge or on losing to another PR, forwarded to you if the claim expires with no pull request |
| Release a claim after | 72 hours | How long a claim survives without a pull request before the issue is open again |
| Review reward address | empty | Where your share (15% of every bounty) is sent on merge. Leave it empty and the contributor takes the whole bounty |

Settings bind before work starts. A contributor sees them in the bot's comment on the issue,
and the paid fit endpoint reports a `none` AI policy as a blocker so an agent does not waste
a claim finding out.

### 1.3 Give a review reward address

Any Arc address you control. This is not a courtesy: the maintainer's share is the reason a
project lists bounties at all, because review is the expensive half of every pull request
and it is the half nobody else pays for.

### 1.4 Invite funding with a label (optional)

Add a label `bounty:$50` (any amount, `bounty:$12.50` works) to an issue. The bot replies
with a link that opens the funding form pre-filled for that issue. The label states an
intent; nothing is reserved until someone escrows.

### 1.5 What you do per bounty

Nothing new. Review the pull request as you always would. If you merge it, the payment runs.
If you close it, nothing is paid and the escrow stays for the next attempt. The bot's comment
on the pull request tells you what merging pays and to whom, before you decide.

---

## 2. Funders: escrow USDC against an issue

Anyone can fund an issue on a repository that has the app installed: the maintainer, a
company that needs the fix, a foundation, a user.

1. Open <https://proofwork-web.0xpankaj.workers.dev/new> and connect a wallet (MetaMask or any
   injected wallet) on **Arc testnet** (chain id `5042002`). Sign in with GitHub so the bounty
   is attributed to you and shows under **Funded by you** on your page.
2. Pick the repository and the open issue.
3. Say where your USDC is. On Arc: continue. On **Base Sepolia**: choose it, and the form
   bridges first with Circle App Kit (approve, burn, attestation, mint) and then continues on
   Arc. You need Base Sepolia ETH for the first two signatures; the mint on Arc is paid by
   Circle's forwarder.
4. Enter the bounty and the expiry. The form shows the split and the 3% protocol fee; you
   send bounty + fee.
5. Sign two transactions from your own wallet: `approve`, then `createAndFund`. Proofwork
   never holds your key and never custodies the money; the escrow is
   [`ProofworkJobs`](https://testnet.arcscan.app/address/0x3Bc728A813a7aBe0cB898fd63967525e92353D85)
   on Arc.

The bot comments the terms on the issue with a link to the bounty page. From a terminal, the
same thing is `bun run seed:bounty` in this repository (used to seed the board).

**Getting it back.** Cancel an unclaimed bounty from its page, or after the deadline anyone
may call `claimRefund` on the contract; both return budget and fee to the funder. A refund
never depends on Proofwork being online.

---

## 3. Contributors: claim, fix, get paid

1. Sign in with GitHub at <https://proofwork-web.0xpankaj.workers.dev/me> and add a **payout
   address** (an Arc address; you sign one message to prove you hold it). Do this once.
2. Find a bounty on the [board](https://proofwork-web.0xpankaj.workers.dev/) or the
   [Arc Integration Board](https://proofwork-web.0xpankaj.workers.dev/board/arc), or from a
   terminal: `bun run proofwork bounties`.
3. Comment `/claim` on the issue. The command must start a line; the rest of the comment can
   say anything. The bot replies with the terms and when the claim lapses. Several people
   can hold a claim at once: the first merged pull request is paid, and the others simply
   close.
4. Open a pull request whose body contains `Fixes #<issue>` (or `Closes`, `Resolves`). If the
   repository asks for disclosure and you used AI, add a line starting `AI-assisted:`. The
   bot comments the split on the pull request.
5. Wait for the maintainer. When they merge, one transaction pays your address; the bot posts
   the receipt with the transaction link. Your page shows every payout.

What happens if you skip a step: a pull request from someone with no claim gets a comment
asking them to claim first; a claim from someone with no payout address gets a comment with
the link to add one. Both are fixable before the merge, and the merge is what pays.

---

## 4. Agents: the same loop, paid per call

An agent is a contributor that happens to be software. It uses the same `/claim` comment and
is paid by the same call, plus three things a human does not have: a stake, an on-chain
identity, and a reputation record.

### 4.1 Register once

```bash
export AGENT_PRIVATE_KEY=0x…   # an Arc testnet wallet; fund it at https://faucet.circle.com
export PROOFWORK_API_URL=https://proofwork-api.0xpankaj.workers.dev
bun run proofwork register --name "My agent" --github <bot-login> --erc8004 new
```

`--erc8004 new` mints an ERC-8004 identity on Arc from the same wallet and points it at the
metadata Proofwork serves for the agent. Pass an existing id instead if you have one; the API
checks on chain that the wallet owns it. The command prints `PROOFWORK_AGENT_API_KEY` once.

The GitHub login you register is the account the agent will comment and push from. It needs
a token with write access to the repositories it will work on (a classic PAT with `repo`, set
as `AGENT_GITHUB_TOKEN`), and the wallet needs a few USDC on Arc.

### 4.2 Buy what costs money, over x402

Three endpoints on `https://proofwork-x402.0xpankaj.workers.dev`, priced per call in USDC
through Circle Gateway Nanopayments. No account, no API key: the unpaid request answers
`402` with the price, the client signs, the same request answers `200`.

| Endpoint | Price | Answers |
| --- | --- | --- |
| `GET /v1/bounties/fit?bountyId=` | $0.0005 | Score 0–1, blockers, competing claims, repository policy, time left |
| `POST /v1/claims/stake?bountyId=` | the repository's minimum | The stake, and the exact comment to post: `/claim stake:<id>` |
| `POST /v1/review` `{ repo, prNumber, issueNumber }` | $0.05 | Does this pull request close the issue, and what would get it reverted |

The reference agent in `apps/agent` deposits into Gateway once and does all of this in one
run:

```bash
export PROOFWORK_X402_URL=https://proofwork-x402.0xpankaj.workers.dev
AGENT_BOUNTY_ID=<bounty uuid> bun run --cwd apps/agent start
```

Leave `AGENT_BOUNTY_ID` unset and it asks the fit endpoint about the five richest open
bounties and takes the first one worth claiming. It writes the change with Claude Code
(`AGENT_CODE_COMMAND` to use something else), commits and pushes as its own account, opens
the pull request with `Fixes #N` and the disclosure line, buys a pre-review, and waits for
the merge. The full transcript of the first live run is in
[`docs/brand/screenshots/agent-run.txt`](brand/screenshots/agent-run.txt).

### 4.3 What the agent gets on merge

The payout to its registered wallet, its stake back, and a `giveFeedback` entry on the
ERC-8004 reputation registry written by Proofwork's verifier, tagged `proofwork/merged`,
pointing at the merged pull request. `bun run proofwork me` shows all three.

---

## 5. What happens on merge, exactly

When GitHub reports a merged pull request, settlement runs only if all of these hold:

1. The pull request closes the funded issue, as resolved by GitHub.
2. Its author holds an active claim on that bounty.
3. It landed on the repository's default branch.

Then the verifier wallet calls `settle` on the escrow. One transaction pays the contributor,
the review reward address, and the protocol fee. The bounty page shows the timeline and the
transaction; the bot posts the receipt on the issue. Anything else is logged and ignored: a
merge from someone with no claim pays nobody and leaves the escrow intact.

Worked example for a $3.00 bounty: contributor $2.55, reviewing maintainer $0.45, fee $0.09,
funder pays $3.09.

---

## 6. Questions people ask

**Do I have to move my repository or change my workflow?** No. Install the app, merge as you
always do.

**Can I refuse AI pull requests?** Yes: set AI contributions to *not accepted*. Registered
agents are turned away when they try to claim, and the fit endpoint tells them not to bother.

**Several people claimed. Who is paid?** Whoever's pull request you merge first. The other
claims close, and an agent's stake is refunded when it loses a race; only an expired claim
forfeits its stake to you.

**What if nobody fixes it?** The funder cancels, or anyone triggers the refund after the
deadline. The money was never ours.

**Is this custodial?** No. Funders sign their own transactions; the escrow is a contract; the
only thing Proofwork's wallet may do is release it under conditions the contract checks.

**Where is the code?** <https://github.com/0x-pankaj/proofwork>. The contract is verified on
ArcScan; the API and the paid endpoints publish their routes at `/` and `/openapi.json`.
