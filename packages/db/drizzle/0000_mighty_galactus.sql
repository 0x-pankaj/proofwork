CREATE TYPE "public"."bounty_status" AS ENUM('draft', 'funding', 'pending_accept', 'open', 'claimed', 'submitted', 'settling', 'settled', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('active', 'withdrawn', 'won', 'lost', 'expired');--> statement-breakpoint
CREATE TYPE "public"."claimant_kind" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."stake_status" AS ENUM('none', 'held', 'refunded', 'forwarded_to_maintainer');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('User', 'Organization');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('github', 'circle');--> statement-breakpoint
CREATE TYPE "public"."evaluator_mode" AS ENUM('proofwork', 'client');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'submitted', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('open', 'merged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payout_kind" AS ENUM('eoa', 'circle_modular', 'circle_agent');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"wallet_address" text NOT NULL,
	"github_login" text NOT NULL,
	"erc8004_agent_id" bigint,
	"metadata_uri" text,
	"api_key_hash" text NOT NULL,
	"reputation_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_walletAddress_unique" UNIQUE("wallet_address"),
	CONSTRAINT "agents_githubLogin_unique" UNIQUE("github_login"),
	CONSTRAINT "agents_apiKeyHash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "bounties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"issue_number" integer NOT NULL,
	"issue_title" text NOT NULL,
	"issue_url" text NOT NULL,
	"description" text NOT NULL,
	"amount_usdc" numeric(20, 0) NOT NULL,
	"fee_usdc" numeric(20, 0) NOT NULL,
	"maintainer_address" text,
	"maintainer_reward_bps" integer DEFAULT 0 NOT NULL,
	"funder_user_id" uuid NOT NULL,
	"funder_address" text NOT NULL,
	"evaluator_address" text NOT NULL,
	"job_id" bigint,
	"status" "bounty_status" DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"create_tx_hash" text,
	"settle_tx_hash" text,
	"circle_tx_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claimant_kind" "claimant_kind" NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"github_login" text NOT NULL,
	"payout_address" text NOT NULL,
	"status" "claim_status" DEFAULT 'active' NOT NULL,
	"stake_payment_id" uuid,
	"stake_status" "stake_status" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installations_githubInstallationId_unique" UNIQUE("github_installation_id")
);
--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"chain_id" integer PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_source" NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "x402_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"payer" text NOT NULL,
	"amount_usdc" numeric(20, 0) NOT NULL,
	"network" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x402_payments_requestId_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"evaluator_mode" "evaluator_mode" DEFAULT 'proofwork' NOT NULL,
	"maintainer_user_id" uuid,
	"maintainer_payout_address" text,
	"policy" jsonb DEFAULT '{"aiContributions":"disclosure","minStakeUsdc":"1000000","autoAccept":true,"claimTtlHours":72}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_githubRepoId_unique" UNIQUE("github_repo_id")
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"bounty_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"provider_address" text NOT NULL,
	"amount_usdc" numeric(20, 0) NOT NULL,
	"fee_usdc" numeric(20, 0) NOT NULL,
	"screening_result" jsonb,
	"tx_hash" text,
	"circle_tx_id" text,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"pr_url" text NOT NULL,
	"head_sha" text NOT NULL,
	"merge_sha" text,
	"merged_at" timestamp with time zone,
	"deliverable_hash" text,
	"status" "submission_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"email" text,
	"payout_address" text,
	"payout_kind" "payout_kind" DEFAULT 'eoa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_githubId_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_funder_user_id_users_id_fk" FOREIGN KEY ("funder_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_stake_payment_id_x402_payments_id_fk" FOREIGN KEY ("stake_payment_id") REFERENCES "public"."x402_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_maintainer_user_id_users_id_fk" FOREIGN KEY ("maintainer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bounties_active_per_issue_idx" ON "bounties" USING btree ("repo_id","issue_number") WHERE status not in ('settled', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE INDEX "bounties_status_idx" ON "bounties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bounties_job_id_idx" ON "bounties" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_active_per_login_idx" ON "claims" USING btree ("bounty_id","github_login") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_delivery_idx" ON "webhook_events" USING btree ("source","delivery_id");--> statement-breakpoint
CREATE INDEX "repos_full_name_idx" ON "repos" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_one_per_bounty_idx" ON "settlements" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "users_login_idx" ON "users" USING btree ("login");