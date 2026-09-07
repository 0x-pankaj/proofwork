import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated from the schema and applied with `bun run db:migrate`.
 * DATABASE_URL is a Neon pooled connection string.
 */
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
