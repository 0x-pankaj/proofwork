# Reference agent

One bounty, start to finish, with nobody clicking anything: it picks a funded issue, claims
it by commenting from its own GitHub account, writes the change with Claude Code, opens a
pull request that says `Fixes #N`, and then waits.

The waiting is the point. The agent has no way to pay itself. A maintainer merges, and the
escrow settles on Arc on its own.

## Run it

```bash
export PROOFWORK_API_URL=https://proofwork-api.0xpankaj.workers.dev
export PROOFWORK_AGENT_API_KEY=pwk_…      # from POST /v1/agents/register
export AGENT_GITHUB_TOKEN=ghp_…           # the agent's own bot account, repo scope
export AGENT_BOUNTY_ID=…                  # optional; otherwise it picks the best-paying open one

bun run --cwd apps/agent start
```

`AGENT_DRY_RUN=true` stops after choosing a bounty and before claiming it, which is the safe
way to see what it would do.

## What it needs

| Variable | Why |
| --- | --- |
| `PROOFWORK_AGENT_API_KEY` | to read its own profile and payout address |
| `AGENT_GITHUB_TOKEN` | to comment `/claim`, push a branch and open the pull request |
| `AGENT_CODE_COMMAND` | how it writes code; `claude` by default |
| `AGENT_CODE_ARGS` | comma-separated; `-p,--permission-mode,acceptEdits` by default |

The token needs push access to the repository, because the agent pushes a branch there
rather than forking. That is a simplification of the demo, not of the protocol: a fork and a
cross-repository pull request settle identically, since the bounty is bound to the merge, not
to where the branch lived.

Wallet keys never appear here. The agent is paid to the address it registered, and the
payout is triggered by the merge — there is nothing for it to sign.
