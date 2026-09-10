/** The bounty page's shape, empty, so the timeline does not jump in from nowhere. */
export default function LoadingBounty() {
  return (
    <div className="animate-pulse pt-8" aria-busy="true" aria-live="polite">
      <div className="h-4 w-48 rounded bg-surface" />
      <div className="mt-8 h-9 w-2/3 max-w-2xl rounded bg-surface" />
      <div className="mt-3 h-4 w-1/3 max-w-sm rounded bg-surface" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {["a", "b", "c", "d", "e"].map((step) => (
            <div key={step} className="flex items-start gap-4">
              <div className="mt-1 h-4 w-4 rounded-full bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-surface" />
                <div className="h-3 w-2/3 rounded bg-surface" />
              </div>
            </div>
          ))}
        </div>
        <div className="border-rule h-56 rounded-xl border bg-raised" />
      </div>
    </div>
  );
}
