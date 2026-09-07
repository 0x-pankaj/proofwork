import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  issueCommentEventSchema,
  issuesEventSchema,
  parseEvent,
  pullRequestEventSchema,
} from "@proofwork/github";
import type { Env } from "../env";
import { circleCompliance, circleWallets, db, github } from "../services";
import { settleBountyById } from "../settlement";
import { databaseStore } from "../store";
import type { GitHubEventHandler } from "./github";
import { handleInstallation, handleInstallationRepositories } from "./handlers/installation";
import { handleIssueComment } from "./handlers/issue-comment";
import { handleIssues } from "./handlers/issues";
import { handlePullRequest } from "./handlers/pull-request";

/**
 * Routes a verified delivery to the handler for its event.
 *
 * Events with no handler are already stored by the caller, so adding one later is a pure
 * addition: nothing is lost in the meantime.
 */
export function githubDispatcher(env: Env): GitHubEventHandler {
  const store = databaseStore(db(env));

  return async (event, payload) => {
    switch (event) {
      case "installation":
        return handleInstallation(store, parseEvent(event, installationEventSchema, payload));
      case "installation_repositories":
        return handleInstallationRepositories(
          store,
          parseEvent(event, installationRepositoriesEventSchema, payload),
        );
      case "issue_comment":
        return handleIssueComment(
          { store, github: github(env), env },
          parseEvent(event, issueCommentEventSchema, payload),
        );
      case "issues":
        return handleIssues(
          { store, github: github(env), env },
          parseEvent(event, issuesEventSchema, payload),
        );
      case "pull_request":
        return handlePullRequest(
          {
            store,
            github: github(env),
            env,
            // Built here rather than up front: a merge is the only event that needs the
            // verifier wallet, and most deliveries are not merges.
            settle: async (bountyId) => {
              await settleBountyById(
                {
                  store,
                  github: github(env),
                  wallets: circleWallets(env),
                  compliance: circleCompliance(env),
                  env,
                },
                bountyId,
              );
            },
          },
          parseEvent(event, pullRequestEventSchema, payload),
        );
      default:
        return;
    }
  };
}
