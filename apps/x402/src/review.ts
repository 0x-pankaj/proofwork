import type { GitHubClient, RepoRef } from "@proofwork/github";
import { z } from "zod";
import type { Env } from "./env";
import { type Model, ModelError, model as modelFor, modelName } from "./model";
import { failure, ok, type Result } from "./result";

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
  model?: Model;
}

export async function pullRequestReview(deps: ReviewDeps, payload: unknown): Promise<Result> {
  const parsed = reviewSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(400, "invalid_request", "send { repo, prNumber, issueNumber? }");
  }

  const { repo, prNumber, issueNumber } = parsed.data;
  const ref = await deps.installationFor(repo);
  if (!ref) {
    return failure(
      404,
      "not_installed",
      `Proofwork is not installed on ${repo}, so its diff cannot be read`,
    );
  }

  const [pull, diff, issue] = await Promise.all([
    deps.github.getPullRequest(ref, prNumber),
    deps.github.getPullRequestDiff(ref, prNumber),
    issueNumber ? deps.github.getIssue(ref, issueNumber) : Promise.resolve(undefined),
  ]);

  let verdict: Verdict;
  try {
    verdict = await review(deps, {
      title: pull.title,
      body: pull.body ?? "",
      diff: diff.slice(0, MAX_DIFF_CHARS),
      truncated: diff.length > MAX_DIFF_CHARS,
      ...(issue?.title ? { issueTitle: issue.title } : {}),
      ...(issue?.body ? { issueBody: issue.body } : {}),
    });
  } catch (cause) {
    // The buyer has already paid by the time we get here, so they are owed a reason rather
    // than a stack trace. `modelConfigured` keeps the common case from reaching this at all.
    if (cause instanceof ModelError) {
      return failure(cause.status, "model_unavailable", cause.message);
    }
    throw cause;
  }

  return ok({
    repo,
    prNumber,
    issueNumber: issueNumber ?? null,
    model: modelName(deps.env),
    ...verdict,
  });
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
  const client = deps.model ?? modelFor(deps.env);

  const issue = input.issueTitle
    ? `Issue: ${input.issueTitle}\n${(input.issueBody ?? "").slice(0, 4_000)}`
    : "No issue was supplied; judge the pull request against its own description.";

  const text = await client.complete({
    // Headroom on purpose. A verdict cut off mid-JSON parses as nothing, and the buyer has
    // already paid by then — the few tenths of a cent this costs are cheaper than that.
    maxTokens: 1_200,
    system: SYSTEM,
    user: `${issue}

Pull request: ${input.title}
${input.body.slice(0, 4_000)}

Diff${input.truncated ? " (truncated)" : ""}:
${input.diff}`,
  });

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
