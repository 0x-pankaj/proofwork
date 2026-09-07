import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  issuesEventSchema,
  parseEvent,
} from "@proofwork/github";
import type { Env } from "../env";
import { db, github } from "../services";
import { databaseStore } from "../store";
import type { GitHubEventHandler } from "./github";
import { handleInstallation, handleInstallationRepositories } from "./handlers/installation";
import { handleIssues } from "./handlers/issues";

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
      case "issues":
        return handleIssues(
          { store, github: github(env), env },
          parseEvent(event, issuesEventSchema, payload),
        );
      default:
        return;
    }
  };
}
