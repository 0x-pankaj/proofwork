"use client";

import { useState } from "react";
import { buttonStyles, Panel } from "@/components/ui";
import type { RepoPolicy } from "@/lib/types";
import { savePolicy } from "./actions";

/**
 * The terms a maintainer sets. These are the settings that decide whether listing a
 * repository is worth the review time: who may claim, what they put at risk, and where
 * the review reward lands.
 */

const AI_OPTIONS: Array<{ value: RepoPolicy["aiContributions"]; label: string; hint: string }> = [
  { value: "allowed", label: "Welcome", hint: "Agents may claim without saying so." },
  {
    value: "disclosure",
    label: "With disclosure",
    hint: "The pull request must say it is AI-assisted.",
  },
  { value: "none", label: "Not accepted", hint: "Registered agents cannot claim here." },
];

export function PolicyForm({
  repoId,
  policy,
  maintainerPayoutAddress,
}: {
  repoId: string;
  policy: RepoPolicy;
  maintainerPayoutAddress: string | null;
}) {
  const [ai, setAi] = useState(policy.aiContributions);
  const [autoAccept, setAutoAccept] = useState(policy.autoAccept);
  const [ttl, setTtl] = useState(policy.claimTtlHours);
  const [address, setAddress] = useState(maintainerPayoutAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await savePolicy(repoId, {
        aiContributions: ai,
        autoAccept,
        claimTtlHours: ttl,
        maintainerPayoutAddress: address.trim() === "" ? null : address.trim(),
      });
      setSaved(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message.split("\n")[0] ?? message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-7 p-6">
      <fieldset>
        <legend className="text-sm font-medium">AI-assisted contributions</legend>
        <div className="mt-3 space-y-2">
          {AI_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="ai"
                className="mt-1"
                checked={ai === option.value}
                onChange={() => setAi(option.value)}
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-ink-faint">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={autoAccept}
          onChange={(event) => setAutoAccept(event.target.checked)}
        />
        <span>
          <span className="font-medium">Open bounties automatically</span>
          <span className="block text-ink-faint">
            When off, someone else&apos;s bounty on your issue waits for you to accept it.
          </span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Release a claim after</span>
        <span className="mt-2 flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={720}
            value={ttl}
            onChange={(event) => setTtl(Number(event.target.value))}
            className="border-rule tabular w-24 rounded-lg border bg-paper px-3 py-2 font-mono"
          />
          <span className="text-ink-faint">hours without a pull request</span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Review reward address</span>
        <span className="mt-1 block text-ink-faint">
          Where your share of each bounty is sent. Without one, the contributor receives the whole
          bounty.
        </span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          className="border-rule mt-2 w-full rounded-lg border bg-paper px-3 py-2 font-mono text-sm"
        />
      </label>

      <div className="flex items-center gap-4">
        <button type="button" className={buttonStyles.primary} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved ? <span className="text-sm text-paid">Saved.</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </Panel>
  );
}
