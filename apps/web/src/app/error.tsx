"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonStyles, EmptyState } from "@/components/ui";

/**
 * The page that shows when a page cannot. Every route here is rendered on request from
 * the API, so this is what an API outage looks like to a visitor: a sentence and a way
 * back, not a stack trace.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page failed", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="pt-16">
      <EmptyState title="Something did not load.">
        <p>
          The board could not be reached just now. Nothing about a bounty changes when this page
          fails: the escrow is on chain, not here.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className={buttonStyles.primary}>
            Try again
          </button>
          <Link href="/" className={buttonStyles.secondary}>
            Back to the board
          </Link>
        </div>
      </EmptyState>
    </div>
  );
}
