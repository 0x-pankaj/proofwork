import type { ReactNode } from "react";

/**
 * The settlement timeline: funded → claimed → pull request → merged → paid.
 *
 * It is the answer to the only question anyone actually has on a bounty page — where is
 * my money — so it is the page's centrepiece rather than a footnote.
 */

export interface TimelineStep {
  label: string;
  detail?: ReactNode;
  at?: string | null;
  state: "done" | "current" | "waiting";
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={`absolute top-5 left-[7px] h-full w-px ${
                  step.state === "done" ? "bg-paid/40" : "bg-rule"
                }`}
              />
            ) : null}

            <span
              aria-hidden
              className={`relative mt-1 size-[15px] shrink-0 rounded-full border-2 ${
                step.state === "done"
                  ? "border-paid bg-paid"
                  : step.state === "current"
                    ? "border-pending bg-pending-soft"
                    : "border-rule bg-paper"
              }`}
            />

            <div className="min-w-0 flex-1">
              <p
                className={`font-medium ${step.state === "waiting" ? "text-ink-faint" : "text-ink"}`}
              >
                {step.label}
              </p>
              {step.detail ? <div className="mt-1 text-sm text-ink-soft">{step.detail}</div> : null}
            </div>

            {step.at ? (
              <time className="shrink-0 text-sm text-ink-faint tabular">{step.at}</time>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
