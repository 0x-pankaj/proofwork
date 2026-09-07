#!/usr/bin/env bun
/**
 * Forwards GitHub's webhook deliveries to the API running on localhost.
 *
 * GitHub cannot reach a laptop, so deliveries go to a smee.io channel and this relays
 * them to `wrangler dev`. Run it alongside the API while testing the loop:
 *
 *   bun run dev:webhooks
 */

import SmeeClient from "smee-client";

const source = process.env.GITHUB_WEBHOOK_PROXY_URL;
if (!source) {
  throw new Error("GITHUB_WEBHOOK_PROXY_URL is not set in .env (the smee.io channel URL)");
}

const target = `${process.env.PUBLIC_API_URL ?? "http://localhost:8787"}/webhooks/github`;

const smee = new SmeeClient({ source, target, logger: console });
await smee.start();

console.log(`Forwarding ${source} → ${target}`);
console.log("Leave this running while you test claims, pull requests and merges.");
