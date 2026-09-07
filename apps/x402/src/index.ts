import { createDatabase } from "@proofwork/db";
import { createApp } from "./app";
import { readEnv, required } from "./env";
import { githubClient, installationLookup } from "./github";

const env = readEnv();
const port = Number(env.PORT ?? 4020);
const db = createDatabase(required(env, "DATABASE_URL"));

createApp({
  env,
  db,
  github: githubClient(env),
  installationFor: installationLookup(db),
}).listen(port, () => {
  console.log(`proofwork-x402 listening on ${port}`);
});
