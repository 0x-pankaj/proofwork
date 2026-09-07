import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Next.js on Cloudflare Workers. Defaults are deliberate: no incremental cache is
 * configured because every page here is dynamic — a bounty board that serves a stale
 * payout state is worse than one that costs a request.
 */
export default defineCloudflareConfig();
