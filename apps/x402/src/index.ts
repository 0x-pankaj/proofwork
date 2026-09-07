import { createDatabase } from "@proofwork/db";
import { createApp } from "./app";
import { readEnv, required } from "./env";

const env = readEnv();
const port = Number(env.PORT ?? 4020);

createApp({ env, db: createDatabase(required(env, "DATABASE_URL")) }).listen(port, () => {
  console.log(`proofwork-x402 listening on ${port}`);
});
