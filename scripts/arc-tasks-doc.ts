#!/usr/bin/env bun
/**
 * Renders docs/ARC_INTEGRATION_TASKS.md from the task list the API serves, so the
 * document and the board can never disagree.
 *
 *   bun run scripts/arc-tasks-doc.ts
 */

import { writeFile } from "node:fs/promises";
import { formatUsdc } from "@proofwork/chain";
import { ARC_INTEGRATION_TASKS, type ArcTask } from "../apps/api/src/board/tasks";

const OUT = new URL("../docs/ARC_INTEGRATION_TASKS.md", import.meta.url);

const categories = [...new Set(ARC_INTEGRATION_TASKS.map((task) => task.category))];
const total = ARC_INTEGRATION_TASKS.reduce((sum, task) => sum + BigInt(task.suggestedBudgetUsdc), 0n);

const lines = [
  "# Arc Integration Board",
  "",
  "Arc mainnet lands on 16 September 2026. Every wallet, SDK, indexer and docs site that wants",
  "to be there on day one needs the same small pull request: a chain entry, a config, an",
  "example. This is that list, written down as bounties anyone can fund.",
  "",
  "Each task is a real change in a real repository. A funder opens the issue there, escrows",
  "the suggested budget (or their own) on Arc through Proofwork, and the maintainer who",
  "reviews the pull request is paid a share of it when they merge. Budgets are suggestions,",
  "sized to what that maintainer's review is worth.",
  "",
  `${ARC_INTEGRATION_TASKS.length} tasks, ${formatUsdc(total)} suggested in total. The live board is`,
  "[`/board/arc`](https://proofwork-web.0xpankaj.workers.dev/board/arc), served by",
  "`GET /v1/board/arc-integration`. Tasks that already have a funded bounty move off this list",
  "on their own.",
  "",
  "_Generated from `apps/api/src/board/tasks.ts` by `bun run scripts/arc-tasks-doc.ts`. Edit the",
  "list there._",
];

for (const category of categories) {
  lines.push("", `## ${title(category)}`, "");
  lines.push("| Task | Repository | Suggested | Why |", "| --- | --- | --- | --- |");
  for (const task of ARC_INTEGRATION_TASKS.filter((candidate) => candidate.category === category)) {
    lines.push(
      `| ${link(task)} | [${task.repo}](https://github.com/${task.repo}) | ${formatUsdc(BigInt(task.suggestedBudgetUsdc))} | ${task.summary} |`,
    );
  }
}

lines.push(
  "",
  "## Funding one",
  "",
  "1. Open the issue on the repository, quoting the task.",
  "2. Install the Proofwork GitHub App on it (the maintainer does this, or you do on your fork",
  "   of the work if the change is a config file you can carry).",
  "3. Fund it from `/new`. Two signatures from your own wallet; Proofwork never holds the key.",
  "4. Tag it `arc-integration` and it appears on the board.",
  "",
);

await writeFile(OUT, `${lines.join("\n")}\n`);
console.log(`wrote ${OUT.pathname}: ${ARC_INTEGRATION_TASKS.length} tasks`);

function title(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function link(task: ArcTask): string {
  return task.issueUrl ? `[${task.title}](${task.issueUrl})` : task.title;
}
