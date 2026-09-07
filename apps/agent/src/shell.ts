import { spawn } from "node:child_process";

/**
 * Running other people's programs.
 *
 * Every argument is passed as an argument — never interpolated into a shell string —
 * because the values here come from a bounty title and a repository name, which are
 * things strangers write.
 */

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], cwd?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Runs a command and fails loudly, because a half-done clone is worse than no clone. */
export async function must(command: string, args: string[], cwd?: string): Promise<string> {
  const result = await run(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.code}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}
