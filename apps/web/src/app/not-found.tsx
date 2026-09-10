import Link from "next/link";
import { buttonStyles, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="pt-16">
      <EmptyState title="There is nothing at this address.">
        <p>The bounty, agent or repository you followed a link to does not exist here.</p>
        <div className="mt-6">
          <Link href="/" className={buttonStyles.secondary}>
            Back to the board
          </Link>
        </div>
      </EmptyState>
    </div>
  );
}
