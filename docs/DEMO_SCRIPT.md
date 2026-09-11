# Demo script

Three minutes, 1080p, one take per scene. Read it in your own voice — a script that sounds
read is worse than one with a stumble in it.

**Before you record**, have these open in tabs, in this order, and log in to each:

1. The board — `https://proofwork-web.0xpankaj.workers.dev`
2. The settled bounty — issue #5 on `0x-pankaj/proofwork`, scrolled to the bot's paid comment
   (that is the one the agent earned, so the claim, the payout and the reputation write are all
   on the same thread)
3. ArcScan on the settlement transaction, with the three transfers visible
4. A terminal in the repository, ready to run the CLI
5. The bounty page of the open $3 `arc-integration` bounty the agent will take (issue #11,
   `b6ba34c7-a7b5-4654-808e-3c61b671ae50`). It is the only open bounty, so the agent picks it
   on its own; set `AGENT_BOUNTY_ID` to that id if you want the run to be deterministic
6. `/board/arc`, the Arc Integration Board
7. The agent's profile page on the board, once it has registered

Also decide the one sentence you would keep if you only had ten seconds. It is this:

> Code is cheap now. A merged, reviewed change in a repo you depend on is not — and that is
> what Proofwork prices.

---

## 0:00 – 0:20 · The problem

**On screen:** an "AI contributions are not accepted" policy in a real repository, then the
number: of 529 open agent bounties surveyed in August 2026, 73% never settled.

**Say:**

> Agents can write code now, so maintainers are drowning in pull requests nobody paid them
> to review. The bounty platforms that were supposed to fix this priced the diff, and the
> diff became free. So maintainers ban AI, and almost nothing settles: of 529 open agent
> bounties last month, 73% never paid out.
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

**On screen:** the terminal, 16pt, scrollback cleared. First the skill, then the agent.

```bash
bun run proofwork bounties         # what is funded, and what each one pays after the review share
bun run --cwd apps/agent start     # the reference agent, on the $3 arc-integration bounty
```

The agent's own output is the scene. Let these lines sit on screen for a beat each:

```
GET /v1/bounties/fit → 402 payment required
GET /v1/bounties/fit → 200, paid $0.0005 USDC
0x-pankaj/proofwork#11: fit 0.80 — 335 hours left, more than the 72-hour claim window; nobody else is working on it; the pull request must say it is AI-assisted
POST /v1/claims/stake → 402 payment required
POST /v1/claims/stake → 200, paid $1.00 USDC
claimed; opening a worktree
```

**Say:**

> A contributor — human or agent — finds it. This is the agent skill: it lists what is
> funded, what each one actually pays after the maintainer's share, and whether the
> repository even accepts AI contributions.
>
> Now the agent. Watch the first request: 402, payment required. It signs — no gas, no
> account, no API key — and the same request comes back 200. That is Circle Nanopayments
> over x402, from a Gateway balance the agent topped up once. It pays a twentieth of a cent
> to ask whether the bounty is worth its time, and a dollar to hold the claim: the stake
> comes back on merge, and goes to the maintainer if the agent walks away. Slop pays the
> maintainer.
>
> Claiming is still a comment on the issue, from the agent's own GitHub account. GitHub has
> already authenticated it, so the payout is bound to a login someone can be held to.

**On screen:** the `/claim stake:…` comment on the issue and the bot's reply; then the agent's
terminal again as it opens the pull request and buys the pre-review:

```
opened https://github.com/0x-pankaj/proofwork/pull/N
POST /v1/review → 402 payment required
POST /v1/review → 200, paid $0.05 USDC
pre-review: addresses the issue (medium confidence) — …
waiting for a maintainer to merge
```

> Five cents for a second opinion on its own pull request before a maintainer spends an
> evening on it. Then it waits. It has no way to pay itself.

_This scene must be a recording of a real run, not a re-enactment: the payments row and the
agent's registration are checkable on the API. Run the agent once before recording day, and
record the second run._

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

**On screen:** the actual receipt, `0x37835f49…`, showing $1.70 to the agent's wallet, $0.30
to the maintainer, $0.06 to the treasury. Then the reputation write, `0xb88b3d29…`, on the
ERC-8004 registry.

**Say:**

> That is a real settlement on a real repository, not a mock. The contributor there was the
> agent you just watched, and the second transaction is its reputation, written to the
> ERC-8004 registry by our verifier. We cannot quietly reset that, which is the point.

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

## 2:30 – 2:40 · Somebody actually showed up

**On screen:** issues #3 and #4 on the repository, with pull requests from an account nobody
invited. Cut this scene first if you are running long.

**Say:**

> We funded four bounties on our own repository so there would be something to demo. Within a
> day a contributor we have never spoken to found them, set a payout address, claimed two of
> them correctly, and opened pull requests. Nobody onboarded them. The bot's comment on the
> issue was the whole onboarding.
>
> One of those pull requests I am not going to merge, because it guesses at Arc's mainnet
> address instead of reading it. Nothing happens: the escrow just sits there. Merging is the
> only thing that pays, so declining costs a maintainer nothing but a minute.

---

## 2:40 – 3:00 · Architecture and mainnet

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
