import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * The HTTP driver, not the WebSocket one: it is the only Neon driver that works
 * unchanged on Cloudflare Workers, where the API runs. One round trip per query,
 * no connection pool to keep warm, no transactions across statements.
 */
export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a database client");
  }
  return drizzle(neon(connectionString), { schema, casing: "snake_case" });
}

let cached: Database | undefined;

/**
 * The client for this process, built from DATABASE_URL on first use.
 * Workers should call `createDatabase(env.DATABASE_URL)` instead, since bindings
 * arrive per request rather than through the environment.
 */
export function db(): Database {
  if (!cached) {
    cached = createDatabase(process.env.DATABASE_URL ?? "");
  }
  return cached;
}
