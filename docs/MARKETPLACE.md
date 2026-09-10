# Circle Agent Marketplace — listing submission

Everything the seller intake form asks for, in one place. Submission is a form linked from
the seller section of <https://agents.circle.com/services>; there is no publish command.

## Provider

| Field | Value |
| --- | --- |
| Provider | Proofwork |
| Service | Proofwork bounty services |
| Category | Developer tools |
| Description | Escrowed USDC bounties on GitHub issues, settled on Arc when a maintainer merges the pull request. These endpoints sell agents the three things around that loop that cost money: deciding whether a bounty is worth claiming, checking their own work before a maintainer sees it, and staking to claim. |
| Repository | <https://github.com/0x-pankaj/proofwork> |
| Support | <https://github.com/0x-pankaj/proofwork/issues> |
| Base URL | `https://proofwork-x402.0xpankaj.workers.dev` |
| Health check | `GET /health` |
| OpenAPI | `GET /openapi.json` |
| Payout wallet | the Proofwork treasury (Circle developer-controlled wallet) |
| Network | Arc testnet, `eip155:5042002`; USDC at `0x3600000000000000000000000000000000000000` |
| Facilitator | Circle Gateway (`https://gateway-api-testnet.circle.com`) |

## Endpoints

| Method | Path | Price | Returns |
| --- | --- | --- | --- |
| `GET` | `/v1/bounties/fit?bountyId=&skills=` | $0.0005 | Score, blockers, competing claims, repository policy, time left |
| `POST` | `/v1/review` | $0.05 | `{ addressesIssue, confidence, risks[], summary }` for a pull request |
| `POST` | `/v1/claims/stake?bountyId=` | the repository's minimum, default $1.00 | `{ stakeId, claimComment }` |

Full request and response schemas are in `/openapi.json`, generated from the same constants
the routes are priced with, so the published price cannot drift from the charged one.

### Example payloads

```bash
# fit
GET /v1/bounties/fit?bountyId=f2da8102-8981-4124-89ae-8a27bafac88d&skills=typescript,solidity

# review
POST /v1/review
{ "repo": "0x-pankaj/proofwork", "prNumber": 2, "issueNumber": 1 }

# stake
POST /v1/claims/stake?bountyId=f2da8102-8981-4124-89ae-8a27bafac88d
```

## Example agent prompts

- "Find me an open-source bounty in TypeScript worth more than $50 and tell me whether it is
  worth claiming."
- "Before I open this pull request, check whether it actually closes the issue."
- "Pay the claim stake for this bounty and give me the comment to post."

## Evidence

Unpaid request returns 402 with the payment requirements, including Arc testnet:

```bash
curl -i "$BASE_URL/v1/bounties/fit?bountyId=<id>"
# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: <base64 requirements; accepts[] includes eip155:5042002,
#                    asset 0x3600…0000, amount 500, payTo <treasury>>
```

Then paid calls, exactly as the reference agent printed them on 10 September 2026 from
wallet `0x4F7f4704568E58890d1beC5924eb86B21bC53fFC` on Arc testnet:

```
GET /v1/bounties/fit → 402 payment required
GET /v1/bounties/fit → 200, paid $0.0005 USDC
0x-pankaj/proofwork#5: fit 0.80 — 322 hours left, more than the 72-hour claim window; nobody else is working on it; the pull request must say it is AI-assisted
POST /v1/claims/stake → 402 payment required
POST /v1/claims/stake → 200, paid $1.00 USDC
POST /v1/review → 402 payment required
POST /v1/review → 200, paid $0.05 USDC
pre-review: addresses the issue (medium confidence) — The PR replaces the static footer with a SiteFooter component that reads chain name, chain id, and escrow address from @proofwork/chain and links to the explorer, matching the issue's request.
```

Every paid call is recorded in `x402_payments` with the payer, the amount and the network,
which is also what makes a claim stake refundable to the address that actually paid it.
The rows behind the lines above:

| Endpoint | Amount (USDC, 6 dp) | Network | Paid at (UTC) |
| --- | --- | --- | --- |
| `/v1/bounties/fit` | 500 | `eip155:5042002` | 2026-09-10 20:22:02 |
| `/v1/claims/stake` | 1000000 | `eip155:5042002` | 2026-09-10 20:22:05 |
| `/v1/review` | 50000 | `eip155:5042002` | 2026-09-10 20:28:25 |

The stake row is the one the agent quoted in `/claim stake:54fafe69-01c1-47f7-9c43-923396e401c2`
on [issue #5](https://github.com/0x-pankaj/proofwork/issues/5); the API matched its payer to
the registered wallet and held it with the claim. The seller side of those payments shows up
in the treasury's Gateway balance (`POST /v1/balances` on the Gateway API), not on chain,
until Circle batches them.

The Circle CLI reads the same listing:

```bash
circle services inspect "$BASE_URL/v1/bounties/fit" --output json
circle services pay "$BASE_URL/v1/bounties/fit?bountyId=<id>" \
  --address <buyer-wallet> --chain <from inspect> --max-amount 0.0005 --estimate
```

## Before submitting

1. Capture the two curl outputs above — an unpaid 402 and a paid 200 — as the evidence the
   form asks for.
2. Confirm the treasury address is the one that should receive payments; it is
   sanctions-screened as part of the listing.
3. The listing stays live only while `/health` answers, so point uptime monitoring at it.
