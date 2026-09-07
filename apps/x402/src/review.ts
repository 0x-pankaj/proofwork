import Anthropic from "@anthropic-ai/sdk";
import type { GitHubClient, RepoRef } from "@proofwork/github";
import type { Response } from "express";
import { z } from "zod";
import type { Env } from "./env";
import type { PaidRequest } from "./payments";

/**
 * A pre-review of a pull request, for five cents.
 *
 * An agent about to open a pull request wants to know whether it actually closes the
 * issue before a maintainer spends an evening finding out that it does not. This is the
 * cheap version of that answer, and the maintainer gets the same verdict for free in the
 * web app — the price exists to stop agents hammering it, not to sell maintainers a tool.
 *
 * It is advice. It never settles anything: only a merge does that.
 */

export const REVIEW_PRICE_USDC = 50_000n;

/** Enough diff for a verdict without paying to think about a vendored lockfile. */
const MAX_DIFF_CHARS = 60_000;
const MODEL = "claude-sonnet-5";

export const reviewSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  prNumber: z.number().int().positive(),
  /** The issue the pull request claims to close, when the caller knows it. */
  issueNumber: z.number().int().positive().optional(),
});

export interface Verdict {
  addressesIssue: boolean;
  confidence: "low" | "medium" | "high";
  risks: string[];
  summary: string;
}

export interface ReviewDeps {
  env: Env;
  github: GitHubClient;
  /** Resolves the installation that lets us read a private repository's diff. */
  installationFor(repoFullName: string): Promise<RepoRef | undefined>;
  anthropic?: Pick<Anthropic["messages"], "create">;
}

export function reviewHandler(deps: ReviewDeps) {
  return async (req: PaidRequest, res: Response): Promise<void> => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "invalid_request", message: "send { repo, prNumber, issueNumber? }" },
      });
      return;
    }

    const { repo, prNumber, issueNumber } = parsed.data;
    const ref = await deps.installationFor(repo);
    if (!ref) {
      res.status(404).json({
        error: {
          code: "not_installed",
          message: `Proofwork is not installed on ${repo}, so its diff cannot be read`,
        },
      });
      return;
    }

    const [pull, diff, issue] = await Promise.all([
      deps.github.getPullRequest(ref, prNumber),
      deps.github.getPullRequestDiff(ref, prNumber),
      issueNumber ? deps.github.getIssue(ref, issueNumber) : Promise.resolve(undefined),
    ]);

    const verdict = await review(deps, {
      title: pull.title,
      body: pull.body ?? "",
      diff: diff.slice(0, MAX_DIFF_CHARS),
      truncated: diff.length > MAX_DIFF_CHARS,
      issueTitle: issue?.title,
      issueBody: issue?.body,
    });

    res.json({
      repo,
      prNumber,
      issueNumber: issueNumber ?? null,
      model: MODEL,
      ...verdict,
    });
  };
}

interface ReviewInput {
  title: string;
  body: string;
  diff: string;
  truncated: boolean;
  issueTitle?: string;
  issueBody?: string;
}

const SYSTEM = `You review pull requests for Proofwork, which pays contributors when a maintainer merges their work.

Answer only what the diff supports. The question is whether this pull request does what the issue asked, not whether you would have written it the same way. Style opinions are not risks; a risk is something that would make a maintainer revert this after merging it.

Reply as JSON only:
{"addressesIssue": boolean, "confidence": "low"|"medium"|"high", "risks": string[], "summary": string}

"summary" is at most two sentences. "risks" is at most four entries and may be empty.`;

async function review(deps: ReviewDeps, input: ReviewInput): Promise<Verdict> {
  const client =
    deps.anthropic ??
    new Anthropic({
      apiKey: deps.env.ANTHROPIC_API_KEY ?? "",
      ...(deps.env.ANTHROPIC_BASE_URL ? { baseURL: deps.env.ANTHROPIC_BASE_URL } : {}),
    }).messages;

  const issue = input.issueTitle
    ? `Issue: ${input.issueTitle}\n${(input.issueBody ?? "").slice(0, 4_000)}`
    : "No issue was supplied; judge the pull request against its own description.";

  const message = await client.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${issue}

Pull request: ${input.title}
${input.body.slice(0, 4_000)}

Diff${input.truncated ? " (truncated)" : ""}:
${input.diff}`,
      },
    ],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return parseVerdict(text);
}

/**
 * Models wrap JSON in prose often enough that failing the call over it would be a way of
 * charging for nothing. The braces are found, and an unusable answer is said plainly.
 */
export function parseVerdict(text: string): Verdict {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Verdict>;
      return {
        addressesIssue: parsed.addressesIssue === true,
        confidence: parsed.confidence ?? "low",
        risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 4).map(String) : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : text.slice(0, 400),
      };
    } catch {
      // Falls through to the honest answer below.
    }
  }

  return {
    addressesIssue: false,
    confidence: "low",
    risks: [],
    summary: "The reviewer did not return a usable verdict for this pull request.",
  };
}
