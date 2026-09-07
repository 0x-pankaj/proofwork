import Link from "next/link";
import { currentUser } from "@/auth";
import { EmptyState, PageHeading } from "@/components/ui";
import { WalletProvider } from "@/components/wallet-provider";
import { api } from "@/lib/api";
import type { RepoSummary } from "@/lib/types";
import { FundForm } from "./fund-form";

export const dynamic = "force-dynamic";

const INSTALL_URL = "https://github.com/apps/proofwork-arc/installations/new";

export default async function NewBountyPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <PageHeading
          title="Fund an issue"
          lead="Escrow USDC against an open issue. It pays out by itself when the fix is merged."
        />
        <EmptyState title="Sign in with GitHub to fund a bounty.">
          <p>We need to know which account is funding it, and where to comment.</p>
        </EmptyState>
      </>
    );
  }

  const { repos } = await api<{ repos: RepoSummary[] }>("/v1/repos", { actingUserId: user.id });

  return (
    <>
      <PageHeading
        title="Fund an issue"
        lead="The money sits in a contract on Arc until the pull request that fixes this issue is merged. Nobody has to remember to pay anyone."
      />

      {repos.length === 0 ? (
        <EmptyState title="Proofwork is not installed on any of your repositories yet.">
          <p>
            <Link href={INSTALL_URL} className="text-accent-ink underline">
              Install the GitHub App
            </Link>{" "}
            on a repository, then come back.
          </p>
        </EmptyState>
      ) : (
        <WalletProvider>
          <FundForm repos={repos} />
        </WalletProvider>
      )}
    </>
  );
}
