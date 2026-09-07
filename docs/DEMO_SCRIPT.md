# Demo script

Three minutes, 1080p, one take per scene. Read it in your own voice — a script that sounds
read is worse than one with a stumble in it.

**Before you record**, have these open in tabs, in this order, and log in to each:

1. The board — `https://proofwork-web.0xpankaj.workers.dev`
2. The settled bounty — issue #1 on `0x-pankaj/proofwork`, scrolled to the bot's paid comment
3. ArcScan on the settlement transaction, with the three transfers visible
4. A terminal in the repository, ready to run the CLI
5. The bounty page of the open $3 bounty (issue #3)

Also decide the one sentence you would keep if you only had ten seconds. It is this:

> Code is cheap now. A merged, reviewed change in a repo you depend on is not — and that is
> what Proofwork prices.

---

## 0:00 – 0:20 · The problem

**On screen:** an "AI contributions are not accepted" policy in a real repository, then the
number: of 529 open agent-accessible bounties measured in August 2026, 73% were honeypots,
and two settled in thirty days.

**Say:**

> Agents can write code now, so maintainers are drowning in pull requests nobody paid them
> to review. The bounty platforms that were supposed to fix this priced the diff — and the
> diff became free. So maintainers ban AI, agents get scammed, and almost nothing settles.
>
> The two things that stayed scarce are a maintainer's attention and a verified outcome.
> Proofwork prices exactly those.

---

## 0:20 – 0:50 · Funding

**On screen:** the board, then `/new`. Pick a real issue. Set the amount, the deadline, and
the maintainer's review share. Sign `approve` and `createAndFund` in the wallet.

**Say:**

> A funder — usually someone who *uses* the library, not the person who maintains it —
> escrows USDC against an issue, and sets aside a share for whoever reviews it.
>
> Two signatures from their own wallet. Proofwork never holds the key. And notice what is
> missing: there is no gas token. On Arc, USDC *is* the gas.

**On screen:** the bot's comment appearing on the issue with the amount and the review
reward.

---

## 0:50 – 1:40 · The work

**On screen:** the terminal.

```bash
proofwork bounties
proofwork show <id>
proofwork claim <id>
```

**Say:**

> A contributor — human or agent — finds it. This is the agent skill: it lists what is
> funded, what each one actually pays after the maintainer's share, and whether the
> repository even accepts AI contributions.
>
> Claiming is a comment on the issue. That is deliberate: GitHub has already authenticated
> the account, so the payout is bound to a login someone can be held to. And on repositories
> that ask for it, an agent stakes first — a nanopayment over x402, which comes back on merge
> and goes to the maintainer if the pull request is rejected. Slop pays the maintainer.

**On screen:** `/claim` comment posted, the bot replying, then a pull request whose body says
`Fixes #N`.

---

## 1:40 – 2:10 · Merge is the proof

**On screen:** the maintainer merges. Cut straight to the bounty page: the timeline flips to
Paid. Then ArcScan.

**Say:**

> The maintainer merges. Nobody approves a payout, because there is nothing to approve — the
> merge *is* the approval.
>
> One transaction on Arc: the contributor, the maintainer's review reward, and the protocol
> fee. Sub-second finality, about a cent of gas, paid in USDC.

**On screen:** the actual receipt — `0x7ea90960…` — showing $1.70 to the contributor, $0.30
to the maintainer, $0.06 to the treasury.

**Say:**

> That is a real settlement on a real repository, not a mock.

---

## 2:10 – 2:35 · The maintainer's side

**On screen:** repository settings — AI contributions `allowed` / `disclosure` / `none`,
minimum stake, auto-accept.

**Say:**

> This is what makes a maintainer willing to list at all. The policy is enforced before a
> claim is accepted, not argued about after a pull request has already cost them an evening.
> If they say no AI, the bot refuses agent claims. If they say disclosure, the pull request
> has to say so.
>
> And every settlement for an agent writes ERC-8004 reputation on Arc, signed by our verifier
> — so an agent's record is portable, and we cannot quietly reset it.

---

## 2:35 – 3:00 · Architecture and mainnet

**On screen:** `docs/ARCHITECTURE.md`, the system diagram.

**Say:**

> `ProofworkJobs` implements ERC-8183 in full, so any tool that understands the standard
> understands a Proofwork bounty. Circle's developer-controlled wallets sign the settlement,
> Compliance Engine screens every payout, and the paid endpoints agents buy run on Gateway
> nanopayments.
>
> It is deployed and verified on Arc testnet today. Arc mainnet opens on the sixteenth, and
> moving there is a configuration change — the addresses come from one package and nothing in
> the application knows a chain id.
>
> Proofwork is a settlement layer for verified work. GitHub is just the first place a verified
> outcome was already lying around.

---

## Rules for the recording

- **Show the transaction.** Every claim in this script is checkable, and the ArcScan tab is
  what makes a judge believe the rest.
- **Do not narrate the UI.** Nobody needs "and now I'll click here".
- **Say what is not built.** If a scene needs a step you have not run live, cut the scene
  rather than implying it ran.
- **Keep the terminal legible.** 16pt minimum, and clear the scrollback first.
