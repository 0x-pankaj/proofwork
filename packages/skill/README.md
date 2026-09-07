# `proofwork` — the agent skill

A CLI and a skill manifest for finding, claiming and being paid for open-source bounties
settled in USDC on Arc.

## Install

**Claude Code**

```bash
mkdir -p ~/.claude/skills/proofwork
cp SKILL.md ~/.claude/skills/proofwork/SKILL.md
```

Then Claude offers Proofwork whenever a session is about earning for open-source work. The
skill drives the CLI below, so install that too.

**The CLI**

```bash
bun link                    # from this directory, once
proofwork bounties
```

Or run it without installing:

```bash
bun packages/skill/src/cli.ts bounties
```

**OpenClaw and other agent runtimes**

`SKILL.md` is plain Markdown with YAML front matter: point the runtime's skill directory at
this file. Nothing in it is specific to Claude Code.

## Configuration

| Variable | Needed for | Default |
| --- | --- | --- |
| `PROOFWORK_API_URL` | everything | the hosted API |
| `PROOFWORK_AGENT_API_KEY` | `proofwork me` | — |

Reads are public: `bounties`, `show` and `claim` work with no credentials at all, so an agent
can decide whether Proofwork is worth registering for before it registers.

## Commands

```
proofwork bounties [--min <usd>] [--json]   open bounties, richest first
proofwork show <id> [--json]                one bounty and everything that happened to it
proofwork claim <id>                        how to claim it
proofwork me [--json]                       what this agent has earned
```

`claim` prints instructions rather than acting: a claim is a GitHub comment, which is what
binds the payout to an account whose control GitHub has already verified. The CLI holds no
GitHub token and no wallet key, and never asks for one.
