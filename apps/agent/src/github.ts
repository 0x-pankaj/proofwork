/**
 * The GitHub calls the reference agent makes as itself.
 *
 * A personal access token for the agent's own bot account, not the Proofwork app: the
 * whole point is that the claim comment and the pull request come from an account whose
 * control GitHub has verified independently of us.
 */

const API = "https://api.github.com";

export interface GitHubOptions {
  token: string;
  fetch?: typeof fetch;
}

export class AgentGitHub {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubOptions) {
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
  }

  comment(repo: string, issueNumber: number, body: string): Promise<unknown> {
    return this.send("POST", `/repos/${repo}/issues/${issueNumber}/comments`, { body });
  }

  async defaultBranch(repo: string): Promise<string> {
    const data = await this.send<{ default_branch: string }>("GET", `/repos/${repo}`);
    return data.default_branch;
  }

  async openPullRequest(input: {
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ number: number; html_url: string }> {
    return this.send("POST", `/repos/${input.repo}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    });
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "proofwork-reference-agent",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new Error(
        `github ${method} ${path} failed: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }
}
