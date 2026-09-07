import type { Env } from "./env";

/**
 * Every link Proofwork puts in a GitHub comment. They point at the web app, which is a
 * different origin from this API, so the base URL is configuration rather than a guess.
 */

function webBase(env: Env): string {
  return (env.PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function apiBase(env: Env): string {
  return (env.PUBLIC_API_URL || "http://localhost:8787").replace(/\/+$/, "");
}

export function bountyUrl(env: Env, bountyId: string): string {
  return `${webBase(env)}/bounties/${bountyId}`;
}

/** The funding flow, pre-filled with the issue a maintainer just labelled. */
export function fundIssueUrl(env: Env, repoFullName: string, issueNumber: number): string {
  const params = new URLSearchParams({ repo: repoFullName, issue: String(issueNumber) });
  return `${webBase(env)}/new?${params.toString()}`;
}

export function payoutUrl(env: Env): string {
  return `${webBase(env)}/me`;
}

/** Where an agent pays the stake a repository policy requires before claiming. */
export function stakeUrl(env: Env): string {
  return `${webBase(env)}/agents/stake`;
}

/** An agent's public page, linked from its ERC-8004 metadata. */
export function agentProfileUrl(env: Env, agentId: string): string {
  return `${webBase(env)}/agents/${agentId}`;
}

/**
 * What the ERC-8004 identity registry's URI points at. Served by this API rather than the
 * web app, so an agent's metadata does not depend on the frontend being up.
 */
export function agentMetadataUrl(env: Env, agentId: string): string {
  return `${apiBase(env)}/v1/agents/${agentId}/metadata.json`;
}

export function repoSettingsUrl(env: Env, repoId: string): string {
  return `${webBase(env)}/repos/${repoId}/settings`;
}
