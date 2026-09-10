import { setChainEnv } from "@proofwork/chain";
import app from "./app";
import { DAILY_STAKES, HOURLY_SWEEP, reconcileChain, sweepExpiries, sweepStakes } from "./cron";
import type { Env } from "./env";
import { circleWallets, db, github } from "./services";
import { databaseStore } from "./store";

/**
 * The Worker entrypoint.
 *
 * Only the default export lives here: workerd rejects a module whose named exports are
 * not handlers or Durable Objects, so the Hono app and the cron constants are imported
 * rather than re-exported.
 */
export default {
  fetch: app.fetch,

  /**
   * Scheduled work. Every job is safe to run twice and safe to miss: they only ever bring
   * the database in line with the chain and the clock, and the stake sweep is keyed so a
   * repeat cannot pay twice.
   */
  async scheduled(controller, env, ctx) {
    setChainEnv(env);
    const store = databaseStore(db(env));

    ctx.waitUntil(
      (async () => {
        try {
          const result =
            controller.cron === HOURLY_SWEEP
              ? await sweepExpiries({ store, env, github: github(env) })
              : controller.cron === DAILY_STAKES
                ? await sweepStakes({ store, env, wallets: circleWallets(env) })
                : await reconcileChain({ store, env });
          console.log("cron", { cron: controller.cron, ...result });
        } catch (error) {
          console.error("cron failed", { cron: controller.cron, message: String(error) });
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
