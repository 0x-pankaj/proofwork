# Proofwork, in depth

What the product is, what it guarantees, and what it deliberately refuses to do.

For the system diagram, trust boundaries and failure table, see
[`ARCHITECTURE.md`](ARCHITECTURE.md). This document is about the product, not the wiring.

---

## 1. What it is, in one paragraph

Proofwork escrows USDC against a GitHub issue before anyone starts work, and splits it three
ways the moment a maintainer merges the pull request that closes it: the contributor who
wrote the code, the maintainer who reviewed it, and a protocol fee. The merge is the
approval. There is no invoice, no payout button, and no second decision — a maintainer who
merges has already authorised the payment, because merging *is* the authorisation.

It runs on Arc, Circle's L1 where USDC is the native gas token, and it treats human and
agent contributors identically: both claim by commenting on the issue, both are paid by the
same contract call.

## 2. The problem

Open-source bounties mostly do not pay. Of 529 open agent bounties surveyed in August 2026,
73% never settled — not because the work was bad, but because settlement depended on someone
remembering to send money after the fact.

Underneath that is a change in what is scarce. Agents made writing code cheap. They did not
make *reviewing* it cheap. A maintainer facing a queue of AI-generated pull requests is doing
more unpaid work than before, and every bounty platform that came before paid only the
contributor. That is the reason maintainers never listed: they were being asked to absorb
the expensive half for free.

## 3. The insight

Two things follow from that, and the whole product is built on them.

**The merge is the only oracle worth having.** Every alternative — a reviewer marking work
complete, an arbitration panel, an AI judge scoring a diff — invents a new decision that
someone has to make and someone has to trust. Merging is a decision the maintainer was
already going to make, on a signal they already trust, recorded somewhere neither party
controls. Building settlement on it adds no new trusted party.

**Review is the scarce resource, so review is what gets paid.** The maintainer's share is
not a courtesy. It is the reason a repository would list a bounty at all.

## 4. Roles

| Role | Holds | Does |
| --- | --- | --- |
| **Funder** | their own wallet | escrows USDC against an issue; signs `approve` and `createAndFund` themselves |
| **Maintainer** | the repository | sets policy, reviews, merges. Paid a share of every bounty they review |
| **Contributor** | a GitHub login and a payout address | comments `/claim`, opens a pull request, is paid on merge |
| **Agent** | a wallet, optionally an ERC-8004 identity | the same as a contributor, plus a stake and on-chain reputation |
| **Proofwork** | a verifier wallet and a treasury | watches GitHub, calls `settle`, takes 3% |

Proofwork never holds a funder's key and never custodies the bounty. The API hands out
calldata; the browser signs it; the escrow is a contract on Arc.

## 5. The lifecycle

A bounty moves through these and only these states:

```
draft → funding → pending_accept → open → claimed → submitted → settling → settled
                                     ↓        ↓          ↓
                                  expired / cancelled / rejected
```

`ProofworkJobs` implements **ERC-8183** in full, plus the three-way settlement the standard
does not model. The state machine lives in one place (`packages/core/src/status.ts`) because
webhooks arrive out of order and get redelivered, so every handler asks it what is allowed
rather than trusting the event it just received.

### What has to be true before money moves

When the merge webhook arrives, settlement runs only if all of these hold:

1. The pull request actually closes the funded issue (`Fixes #N`, resolved by GitHub).
2. Its author holds an **active claim** on that bounty.
3. The base branch is the one the repository ships from — not a side branch the contributor
   opened and merged into themselves.

Only then does the verifier wallet call `settle`. Anything else is logged and ignored.

### Claims

A contributor comments `/claim`. GitHub has already authenticated them, so the comment
doubles as proof they control that login — there is no separate signup, and no way to claim
as somebody else. One active claim per login per bounty, enforced by a partial unique index
rather than by application code.

A claim that sits without a pull request past the repository's window is released, so a
bounty cannot be squatted indefinitely.

## 6. Policy: terms set before work starts

Every argument about an AI-generated pull request happens *after* it is opened. Proofwork
moves that argument forward, to a setting a maintainer chooses once:

| Setting | Default | Decides |
| --- | --- | --- |
| AI contributions | With disclosure | Welcome, must be disclosed, or not accepted at all |
| Auto-accept bounties | On | Whether a bounty someone else funds opens at once or waits for the maintainer's accept |
| Minimum stake | $1.00 | What an agent puts up to hold a claim |
| Release a claim after | 72 hours | How long a claim survives without a pull request |
| Review reward address | — | Where the maintainer's share is sent |

`aiContributions: "none"` is enforced against registered agents, and the paid fit endpoint
reports it as a blocker so an agent does not waste a claim discovering it.

Leave the review reward address empty and the contributor receives the whole bounty. Nothing
silently pockets the difference.

## 7. The money

A worked example, matching the live contract exactly:

| | $3.00 bounty |
| --- | --- |
| Contributor | **$2.55** |
| Reviewing maintainer | **$0.45** (15%) |
| Protocol fee | **$0.09** (3%) |
| Funder pays | $3.09 |

Three transfers, one transaction, a few seconds. The fee is escrowed at funding time
alongside the budget, so a later fee change cannot reprice a job that is already funded —
one of the properties the contract's Foundry suite tests directly.

USDC is held as 6-decimal integers everywhere. Arc's native 18-decimal view of the same
balance is used only for gas arithmetic, and the two are never summed. On this chain that is
the single easiest thing to get wrong.

### If nobody delivers

The escrow comes back, and not as a favour:

- **`cancel`** — the funder takes back a bounty nobody has claimed.
- **`claimRefund`** — once the deadline passes, **anyone** can return the escrow to the
  funder. Not the funder alone, and not us: a refund that depended on Proofwork being online
  would be a promise we might not be able to keep.

Both return budget and fee together.

## 8. Agents

An agent is a contributor that happens not to be a person. It uses the same claim comment
and is paid by the same call. Three things are specific to it:

**Identity.** An agent registers by signing a message with the wallet it wants to be paid to.
If it also claims an **ERC-8004** identity, the API reads `ownerOf` on Arc and refuses unless
that wallet owns the token — so nobody inherits another agent's reputation by pasting an id.

**Reputation.** A merged bounty writes `giveFeedback` to the ERC-8004 reputation registry
from the verifier wallet, tagged `proofwork/merged` and pointing at the merged pull request.
The registry refuses feedback from the agent's own owner, and we are not it. The record
outlives us, which is the only thing that makes it worth anything.

**Stake.** An agent puts up the repository's minimum to hold a claim, paid over x402. What
happens to it:

| Claim ends | Stake | Why |
| --- | --- | --- |
| Won | refunded | it delivered |
| Lost | refunded | someone merged first — that is the system working, not abuse |
| Expired | forwarded to the maintainer | it held the issue and delivered nothing |
| Withdrawn | refunded | it cost nobody anything |

Refunding a lost claim matters more than it looks. Keeping it would make claiming a bet on
being fastest, and the board would fill with one agent claiming everything defensively.

### What an agent pays for

Three endpoints, priced per call in USDC over Circle Gateway Nanopayments. No account, no API
key — the payment is the authentication.

| Endpoint | Price | Answers |
| --- | --- | --- |
| `/v1/bounties/fit` | $0.0005 | Is this worth claiming? Blockers, competing claims, policy |
| `/v1/review` | $0.05 | Does this pull request close the issue, and what would get it reverted? |
| `/v1/claims/stake` | the repo's minimum | Pays the stake, returns the id to quote in `/claim` |

Fit is priced so an agent can afford to ask about every bounty on the board and still spend
less than one wasted claim. That ratio is the point of the price, not the revenue.

## 9. What it is not

- **Not a freelance marketplace.** There is no profile, no bidding, no rate negotiation.
- **Not an arbitration system.** Nobody adjudicates whether work was good. A maintainer
  merges or does not.
- **Not a code-quality tool.** It does not make a bad pull request good. It makes reviewing
  one paid.
- **Not custodial.** Proofwork cannot move a funder's money. The escrow is a contract; the
  only thing the verifier wallet may do is release it under conditions the contract checks.

## 10. Where it actually is

Stated plainly, because a judge can check it.

**Exercised.** Issue #1 on this repository was funded, claimed, fixed, merged and settled in
a single transaction on Arc testnet — $1.70 to the contributor, $0.30 to the reviewing
maintainer, $0.06 fee. The escrow path is real and has moved real money.

**Exercised, by an agent.** On 10 September the reference agent in `apps/agent` — GitHub
login `askmilan`, wallet `0x4F7f…3fFC`, ERC-8004 identity
[#894122](https://testnet.arcscan.app/tx/0xd376b6dac20bec0467432c83a0387fbb537163faf2bf5315605f707af3003816) minted from that wallet — ran
[issue #5](https://github.com/0x-pankaj/proofwork/issues/5) end to end with nobody typing:
[deposited $2 into Gateway](https://testnet.arcscan.app/tx/0xc0f6653e84a1102d0c2a1c2ded71601d58892fd7c16c104ecbdf58a6a2a2e3a6),
paid $0.0005 for a fit score, paid the $1.00 stake and claimed with `/claim stake:<id>`,
wrote the change, committed and pushed as itself, opened
[pull request #9](https://github.com/0x-pankaj/proofwork/pull/9), and paid $0.05 for a
pre-review of its own work. The maintainer merged;
[settlement](https://testnet.arcscan.app/tx/0x37835f4998d1ccb8c6bc3caa3ff4aa66cbbb5e0f8d6aedd268036e908a4bb530) paid $1.70
to the agent's wallet, $0.30 to the reviewer and $0.06 fee 3.8 s later, and the verifier
wrote [`giveFeedback`](https://testnet.arcscan.app/tx/0xb88b3d294db2289da148ce2123d0d94c5dda6c322f01326dfb7fd18143f42104) on
the reputation registry. The database now holds 1 agent, 5 nanopayments and 1 reputation
event. `REQUIRE_AGENT_STAKE` is on: an agent that does not stake is told so and is not
claimed.

**Exercised, the morning after.** The agent's $1.00 stake was
[refunded](https://testnet.arcscan.app/tx/0x04a9f53dcf91e47df04e0b01a56544468772c673c4d609616e446ad6749ad5b2) from the
treasury by the daily stake sweep. It did not go back on the first try: nanopayment income
accrues in the treasury's *Gateway* balance while refunds are sent from its on-chain balance,
which held only fees, and the transfer call was missing the chain name Circle requires next
to a token address. Both are fixed; the lesson about the float is in the README's mainnet
runbook.

**Exercised.** On 12 September the App Kit bridge moved $2.00 in the funding direction:
[approve](https://sepolia.basescan.org/tx/0x0c5d201b24972175755b8a0fa6cbb12597e9a9225b4fba290225cf97ea9aba16)
and [burn](https://sepolia.basescan.org/tx/0x9d2a996d3bf8f4d46bc52a5d9ec0501c777e428e14b83123f9a20aeb4ff85928)
on Base Sepolia, the attestation, then the [mint](https://testnet.arcscan.app/tx/0xc9f3f863951c60ee29ad070f5e425c4cf0e38f623a1fa43d47c1251e58cf0a6f)
on Arc. Four steps, all green. The mint was paid by Circle's Forwarding Service rather than by
the funder, so arriving on Arc costs them nothing.

The same call had already run [the other way](https://sepolia.basescan.org/tx/0xac1dbc595d76c215748178c8e59adf01145d03e5eb1c8343914ec1b6a7f82e8d)
while the wallet still held no Base Sepolia ETH. Getting that ETH turned out to be the one
part nobody can automate: every Base Sepolia faucet now wants a mainnet balance first, so the
gas came from an Ethereum Sepolia faucet and crossed on Base's own bridge. It cost a millionth
of an ether to spend. Worth knowing before a demo, and a reminder that the awkward chain in
this product is never Arc.

**Unsolicited demand.** Within hours of the bounties being funded, three GitHub accounts
nobody invited opened pull requests against issues #4 and #5 without claiming. The bot told
each to claim first and asked the two who did claim for a payout address. None has been
paid, which is the point: the merge pays a claimant, not whoever gets there first.

**The Arc Integration Board** is seeded with four funded tasks on this repository — one
settled, three open — and 23 suggested tasks across chain registries, wallets, SDKs,
indexers and docs.

Everything here is Arc **testnet**. Circle's Nanopayments and Gateway are testnet-only on
every chain they support, so the paid-endpoint half of the product could not be on mainnet
today even if the contracts were.
