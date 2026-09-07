import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  parseEvent,
} from "@proofwork/github";
import type { Env } from "../env";
import { db } from "../services";
import { databaseStore } from "../store";
import type { GitHubEventHandler } from "./github";
import { handleInstallation, handleInstallationRepositories } from "./handlers/installation";

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
      default:
        return;
    }
  };
}
