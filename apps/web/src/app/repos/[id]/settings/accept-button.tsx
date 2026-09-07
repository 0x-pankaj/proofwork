"use client";

import { useState } from "react";
import { buttonStyles } from "@/components/ui";
import { acceptBounty } from "./actions";

/** Opens a bounty someone else funded on your repository. */
export function AcceptButton({ repoId, bountyId }: { repoId: string; bountyId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        className={buttonStyles.secondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await acceptBounty(repoId, bountyId);
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            setError(message.split("\n")[0] ?? message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Accepting…" : "Accept"}
      </button>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}
