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

export type RepositoryPayload = z.infer<typeof repositorySchema>;
export type InstallationEvent = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEvent = z.infer<typeof installationRepositoriesEventSchema>;
export type IssuesEvent = z.infer<typeof issuesEventSchema>;

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

/** Labels arrive either as objects or, on some payloads, as plain strings. */
export function labelNames(labels: IssuesEvent["issue"]["labels"]): string[] {
  return labels.map((label) => (typeof label === "string" ? label : label.name));
}
