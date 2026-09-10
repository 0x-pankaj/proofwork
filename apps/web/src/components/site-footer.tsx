import { activeChain, addressUrl, proofworkJobsAddress } from "@proofwork/chain";
import { ExplorerLink } from "@/components/ui";
import { shortAddress } from "@/lib/format";

/**
 * Which chain this deployment talks to and where the escrow lives, on every page, so a
 * visitor can check the contract in the explorer rather than take the copy on trust.
 */
export function SiteFooter() {
  const chain = activeChain();
  const escrow = proofworkJobsAddress();

  return (
    <footer className="border-rule mx-auto w-full max-w-6xl border-t px-5 py-8 text-sm text-ink-faint sm:px-8">
      <p>
        Escrow on Arc, Circle&apos;s USDC chain. Every payment on this site is a real
        transaction you can open in the explorer.
      </p>
      <p className="mt-2">
        {chain.name} · chain id <span className="tabular font-mono">{chain.id}</span> · escrow
        contract <ExplorerLink href={addressUrl(escrow)}>{shortAddress(escrow)}</ExplorerLink>
      </p>
    </footer>
  );
}
