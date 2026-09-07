import { z } from "zod";

/**
 * Webhook payload shapes, narrowed to the fields Proofwork reads.
 *
 * GitHub sends far more than this and adds fields over time, so the schemas are
 * deliberately permissive about everything else. What they do enforce is that the few
 * fields we act on are present and the right type, checked once at the edge rather than
 * asserted with casts deeper in.
 */

export const repositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  private: z.boolean().optional().default(false),
  /** Only a merge into this branch settles a bounty. */
  default_branch: z.string().optional(),
});

export const senderSchema = z.object({
  id: z.number(),
  login: z.string(),
});

export const installationRefSchema = z.object({ id: z.number() });

export const installationSchema = z.object({
  id: z.number(),
  account: z.object({ login: z.string(), type: z.string().optional() }).nullable().optional(),
  suspended_at: z.string().nullable().optional(),
});

export const installationEventSchema = z.object({
  action: z.string(),
  installation: installationSchema,
  repositories: z.array(repositorySchema).optional(),
});

export const installationRepositoriesEventSchema = z.object({
  action: z.string(),
  installation: installationSchema,
  repositories_added: z.array(repositorySchema).optional().default([]),
  repositories_removed: z.array(repositorySchema).optional().default([]),
});

export const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
  /** Present when the "issue" is really a pull request, which carries no bounty. */
  pull_request: z.unknown().optional(),
  labels: z
    .array(z.union([z.string(), z.object({ name: z.string() })]))
    .optional()
    .default([]),
});

export const issuesEventSchema = z.object({
  action: z.string(),
  issue: issueSchema,
  label: z.object({ name: z.string() }).optional(),
  repository: repositorySchema,
  installation: installationRefSchema.optional(),
  sender: senderSchema,
});

export const commentAuthorSchema = z.object({
  id: z.number(),
  login: z.string(),
  type: z.string().optional(),
});

export const issueCommentEventSchema = z.object({
  action: z.string(),
  issue: issueSchema,
  comment: z.object({
    id: z.number(),
    body: z.string().nullable().optional(),
    html_url: z.string().optional(),
    user: commentAuthorSchema.nullable().optional(),
  }),
  repository: repositorySchema,
  installation: installationRefSchema.optional(),
  sender: senderSchema,
});

export const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    body: z.string().nullable().optional(),
    user: commentAuthorSchema.nullable().optional(),
    head: z.object({ sha: z.string() }),
    base: z.object({ ref: z.string() }),
    draft: z.boolean().optional(),
    merged: z.boolean().optional(),
    merged_at: z.string().nullable().optional(),
    merge_commit_sha: z.string().nullable().optional(),
  }),
  repository: repositorySchema,
  installation: installationRefSchema.optional(),
  sender: senderSchema,
});

export type RepositoryPayload = z.infer<typeof repositorySchema>;
export type InstallationEvent = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEvent = z.infer<typeof installationRepositoriesEventSchema>;
export type IssuesEvent = z.infer<typeof issuesEventSchema>;
export type IssueCommentEvent = z.infer<typeof issueCommentEventSchema>;
export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;

/** Parses a delivery, naming the event in the error so a bad payload is diagnosable. */
export function parseEvent<T>(event: string, schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `${event} payload did not match: ${result.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return result.data;
}

/** The two account types the data model allows; anything else is treated as a user. */
export function accountTypeOf(type: string | undefined): "User" | "Organization" {
  return type === "Organization" ? "Organization" : "User";
}

/** GitHub Apps see their own comments; acting on them is how comment loops start. */
export function isBotAuthor(author: { login: string; type?: string } | null | undefined): boolean {
  if (!author) return true;
  return author.type === "Bot" || author.login.endsWith("[bot]");
}

/** Labels arrive either as objects or, on some payloads, as plain strings. */
export function labelNames(labels: IssuesEvent["issue"]["labels"]): string[] {
  return labels.map((label) => (typeof label === "string" ? label : label.name));
}
