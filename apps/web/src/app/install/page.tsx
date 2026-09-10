import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles, PageHeading } from "@/components/ui";
import { installUrl } from "@/lib/github-app";

export const metadata: Metadata = {
  title: "Install",
  description:
    "What a project does once to accept Proofwork bounties: install the app, set a policy, name a reviewer address.",
};

/** The maintainer's page: three things once, then nothing per bounty. */
export default function InstallPage() {
  return (
    <>
      <PageHeading
        title="Put Proofwork on a repository"
        lead="Three things once. After that a maintainer does nothing they were not already doing — the merge is the approval."
        action={
          <a href={installUrl()} className={buttonStyles.primary}>
            Install the GitHub App
          </a>
        }
      />

      <ol className="border-rule divide-rule mt-4 divide-y border-y">
        <li className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
          <span className="font-mono text-sm text-ink-faint">01</span>
          <div>
            <h2 className="font-medium">Install the GitHub App on the repository</h2>
            <p className="mt-1 text-sm text-ink-soft">
              That is what lets Proofwork read issue comments, link pull requests, and see the
              merge. It writes exactly one thing: comments, under its own name, so the terms and the
              receipt are on the issue where the work is.
            </p>
          </div>
        </li>
        <li className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
          <span className="font-mono text-sm text-ink-faint">02</span>
          <div>
            <h2 className="font-medium">Set the policy</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Whether AI-assisted contributions are welcome, must be disclosed, or are not accepted;
              whether a claim waits for you; what an agent stakes to hold one; how long a claim
              survives without a pull request. Every setting has a working default, and all of them
              bind before work starts.
            </p>
          </div>
        </li>
        <li className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
          <span className="font-mono text-sm text-ink-faint">03</span>
          <div>
            <h2 className="font-medium">Give a review reward address</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Where the maintainer&apos;s share of every bounty is sent when they merge. Leave it
              empty and the contributor takes the whole bounty instead.
            </p>
          </div>
        </li>
      </ol>

      <p className="mt-8 text-sm text-ink-soft">
        Already installed?{" "}
        <Link href="/new" className="text-accent-ink underline">
          Fund an issue
        </Link>{" "}
        or open a repository&apos;s settings from{" "}
        <Link href="/me" className="text-accent-ink underline">
          your page
        </Link>
        .
      </p>
    </>
  );
}
