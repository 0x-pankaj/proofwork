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

Then a paid call:

```bash
circle services inspect "$BASE_URL/v1/bounties/fit" --output json
circle services pay "$BASE_URL/v1/bounties/fit?bountyId=<id>" \
  --address <buyer-wallet> --chain <from inspect> --max-amount 0.0005 --estimate
circle services pay "$BASE_URL/v1/bounties/fit?bountyId=<id>" \
  --address <buyer-wallet> --chain <from inspect> --max-amount 0.0005 --output json
```

Every paid call is recorded in `x402Payments` with the payer, the amount and the network,
which is also what makes a claim stake refundable to the address that actually paid it.

## Before submitting

1. Capture the two curl outputs above — an unpaid 402 and a paid 200 — as the evidence the
   form asks for.
2. Confirm the treasury address is the one that should receive payments; it is
   sanctions-screened as part of the listing.
3. The listing stays live only while `/health` answers, so point uptime monitoring at it.
