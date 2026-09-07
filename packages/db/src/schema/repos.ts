import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { installations } from "./installations";
import { users } from "./users";

/**
 * Who decides that work is done.
 *  - `proofwork`: our verifier wallet settles on a merge by the repo's maintainer.
 *  - `client`: the funder holds the evaluator role and settles themselves.
 */
export const evaluatorMode = pgEnum("evaluator_mode", ["proofwork", "client"]);

/**
 * A maintainer's terms for their repository. Stored as JSON because these are read
 * together, written rarely, and will grow as maintainers ask for more control.
 */
export interface RepoPolicy {
  /**
   * Whether AI-assisted pull requests are welcome. `disclosure` means allowed but the
   * pull request must say so. This is the setting that makes maintainers willing to
   * list at all, so it is enforced before a claim is accepted, not after a merge.
   */
  aiContributions: "allowed" | "disclosure" | "none";
  /** What a claimant must stake, in 6-decimal USDC, to hold a claim. */
  minStakeUsdc: string;
  /** When false, the maintainer must accept a bounty before it appears as claimable. */
  autoAccept: boolean;
  /** How long a claim survives without a pull request before it is released. */
  claimTtlHours: number;
}

export const DEFAULT_REPO_POLICY: RepoPolicy = {
  aiContributions: "disclosure",
  minStakeUsdc: "1000000",
  autoAccept: true,
  claimTtlHours: 72,
};

export const repos = pgTable(
  "repos",
  {
    id: uuid().primaryKey().defaultRandom(),
    githubRepoId: bigint({ mode: "bigint" }).notNull().unique(),
    fullName: text().notNull(),
    installationId: uuid()
      .notNull()
      .references((): AnyPgColumn => installations.id, { onDelete: "cascade" }),
    private: boolean().notNull().default(false),
    /**
     * Whether the app is currently installed on this repository. Uninstalling sets this
     * false rather than deleting the row: settled bounties are the product's history and
     * a maintainer who reinstalls should get it back, not a blank slate.
     */
    installed: boolean().notNull().default(true),
    evaluatorMode: evaluatorMode().notNull().default("proofwork"),
    /** The account paid for reviewing work here. */
    maintainerUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    /** Where the review reward is sent. Without it, a bounty cannot offer one. */
    maintainerPayoutAddress: text(),
    policy: jsonb().$type<RepoPolicy>().notNull().default(DEFAULT_REPO_POLICY),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("repos_full_name_idx").on(table.fullName)],
);

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
