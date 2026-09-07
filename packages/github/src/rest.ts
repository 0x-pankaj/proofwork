import {
  GITHUB_API_BASE_URL,
  GITHUB_API_VERSION,
  GITHUB_USER_AGENT,
  type GitHubAppAuth,
} from "./auth";

/**
 * The slice of the GitHub REST API Proofwork actually uses: read an issue or a pull
 * request, and write comments. Small enough to type honestly, which is worth more here
 * than a generic client, because these calls run on the path that pays people.
 */

export interface RepoRef {
  /** `owner/name`, exactly as GitHub reports it. */
  fullName: string;
  installationId: number;
}

export interface IssueComment {
  id: number;
  body: string;
  htmlUrl: string;
  authorLogin: string;
}

export interface Issue {
  number: number;
  title: string;
  htmlUrl: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  authorLogin: string;
}

export interface PullRequest {
  number: number;
  title: string;
  htmlUrl: string;
  body: string;
  authorLogin: string;
  headSha: string;
  baseRef: string;
  merged: boolean;
  mergeCommitSha: string | null;
  mergedAt: string | null;
}

export interface Repository {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  ownerLogin: string;
}

/** What a GitHub account may do in a repository, as the collaborators API reports it. */
export type RepositoryPermission = "admin" | "write" | "read" | "none";

/** Who is allowed to accept a bounty or be paid for reviewing it. */
export function canMaintain(permission: RepositoryPermission): boolean {
  return permission === "admin" || permission === "write";
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string,
  ) {
    super(`github ${path} failed: ${status} ${detail}`);
    this.name = "GitHubApiError";
  }
}

export interface InstallationSummary {
  id: number;
  accountLogin: string;
  accountType: string;
  suspended: boolean;
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly auth: GitHubAppAuth,
    options: { baseUrl?: string; fetch?: typeof fetch } = {},
  ) {
    this.baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Every installation of the app. Answered with the app JWT rather than an installation
   * token, and used by the sync script that recovers from a missed delivery.
   */
  async listInstallations(): Promise<InstallationSummary[]> {
    const data = await this.send<InstallationPayload[]>(
      `Bearer ${await this.auth.appJwt()}`,
      "GET",
      "/app/installations?per_page=100",
    );
    return data.map((installation) => ({
      id: installation.id,
      accountLogin: installation.account?.login ?? "unknown",
      accountType: installation.account?.type ?? "User",
      suspended: installation.suspended_at !== null && installation.suspended_at !== undefined,
    }));
  }

  /** The repositories one installation can see. */
  async listInstallationRepositories(installationId: number): Promise<Repository[]> {
    const token = await this.auth.installationToken(installationId);
    const data = await this.send<{ repositories: RepositoryPayload[] }>(
      `Bearer ${token}`,
      "GET",
      "/installation/repositories?per_page=100",
    );
    return data.repositories.map((repository) => ({
      id: repository.id,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
      ownerLogin: repository.owner.login,
    }));
  }

  async getRepository(repo: RepoRef): Promise<Repository> {
    const data = await this.request<RepositoryPayload>(repo, "GET", `/repos/${repo.fullName}`);
    return {
      id: data.id,
      fullName: data.full_name,
      private: data.private,
      defaultBranch: data.default_branch,
      ownerLogin: data.owner.login,
    };
  }

  /**
   * A user's permission in the repository. Someone who is not a collaborator at all is
   * a 404 rather than a "none", so that answer is normalised here.
   */
  async permissionFor(repo: RepoRef, login: string): Promise<RepositoryPermission> {
    try {
      const data = await this.request<{ permission: string }>(
        repo,
        "GET",
        `/repos/${repo.fullName}/collaborators/${login}/permission`,
      );
      const permission = data.permission;
      return permission === "admin" || permission === "write" || permission === "read"
        ? permission
        : "none";
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return "none";
      throw error;
    }
  }

  async getIssue(repo: RepoRef, issueNumber: number): Promise<Issue> {
    const data = await this.request<IssuePayload>(
      repo,
      "GET",
      `/repos/${repo.fullName}/issues/${issueNumber}`,
    );
    return toIssue(data);
  }

  async getPullRequest(repo: RepoRef, prNumber: number): Promise<PullRequest> {
    const data = await this.request<PullRequestPayload>(
      repo,
      "GET",
      `/repos/${repo.fullName}/pulls/${prNumber}`,
    );
    return toPullRequest(data);
  }

  async listIssueComments(repo: RepoRef, issueNumber: number): Promise<IssueComment[]> {
    const data = await this.request<IssueCommentPayload[]>(
      repo,
      "GET",
      `/repos/${repo.fullName}/issues/${issueNumber}/comments?per_page=100`,
    );
    return data.map(toIssueComment);
  }

  async createIssueComment(
    repo: RepoRef,
    issueNumber: number,
    body: string,
  ): Promise<IssueComment> {
    const data = await this.request<IssueCommentPayload>(
      repo,
      "POST",
      `/repos/${repo.fullName}/issues/${issueNumber}/comments`,
      { body },
    );
    return toIssueComment(data);
  }

  async updateIssueComment(repo: RepoRef, commentId: number, body: string): Promise<IssueComment> {
    const data = await this.request<IssueCommentPayload>(
      repo,
      "PATCH",
      `/repos/${repo.fullName}/issues/comments/${commentId}`,
      { body },
    );
    return toIssueComment(data);
  }

  /**
   * Writes a comment at most once per marker: a redelivered webhook edits the comment it
   * wrote the first time instead of stacking a second one on the issue.
   */
  async upsertIssueComment(
    repo: RepoRef,
    issueNumber: number,
    marker: string,
    body: string,
  ): Promise<IssueComment> {
    const existing = (await this.listIssueComments(repo, issueNumber)).find((comment) =>
      comment.body.includes(marker),
    );
    return existing
      ? this.updateIssueComment(repo, existing.id, body)
      : this.createIssueComment(repo, issueNumber, body);
  }

  private async request<T>(
    repo: RepoRef,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.auth.installationToken(repo.installationId);
    return this.send<T>(`Bearer ${token}`, method, path, body);
  }

  private async send<T>(
    authorization: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization,
        accept: "application/vnd.github+json",
        "x-github-api-version": GITHUB_API_VERSION,
        "user-agent": GITHUB_USER_AGENT,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new GitHubApiError(response.status, path, await response.text());
    }
    return (await response.json()) as T;
  }
}

interface RepositoryPayload {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}

interface InstallationPayload {
  id: number;
  account?: { login: string; type?: string } | null;
  suspended_at?: string | null;
}

interface IssuePayload {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<{ name: string } | string>;
  user: { login: string } | null;
}

interface PullRequestPayload {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  user: { login: string } | null;
  head: { sha: string };
  base: { ref: string };
  merged?: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
}

interface IssueCommentPayload {
  id: number;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
}

export function toIssue(payload: IssuePayload): Issue {
  return {
    number: payload.number,
    title: payload.title,
    htmlUrl: payload.html_url,
    body: payload.body ?? "",
    state: payload.state,
    labels: payload.labels.map((label) => (typeof label === "string" ? label : label.name)),
    authorLogin: payload.user?.login ?? "",
  };
}

export function toPullRequest(payload: PullRequestPayload): PullRequest {
  return {
    number: payload.number,
    title: payload.title,
    htmlUrl: payload.html_url,
    body: payload.body ?? "",
    authorLogin: payload.user?.login ?? "",
    headSha: payload.head.sha,
    baseRef: payload.base.ref,
    // `merged` is absent on webhook payloads for some events; `merged_at` is the reliable signal.
    merged: payload.merged ?? payload.merged_at !== null,
    mergeCommitSha: payload.merge_commit_sha,
    mergedAt: payload.merged_at,
  };
}

function toIssueComment(payload: IssueCommentPayload): IssueComment {
  return {
    id: payload.id,
    body: payload.body ?? "",
    htmlUrl: payload.html_url,
    authorLogin: payload.user?.login ?? "",
  };
}
