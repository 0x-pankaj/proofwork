/** A quiet placeholder while a page waits on the API. Same rhythm as the board rows. */
export default function Loading() {
  return (
    <div className="animate-pulse pt-14" aria-busy="true" aria-live="polite">
      <div className="h-10 w-2/3 max-w-xl rounded bg-surface" />
      <div className="mt-4 h-5 w-1/2 max-w-md rounded bg-surface" />
      <div className="border-rule divide-rule mt-14 divide-y border-y">
        {["a", "b", "c", "d"].map((row) => (
          <div key={row} className="flex items-center gap-6 py-5">
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 rounded bg-surface" />
              <div className="h-4 w-3/4 rounded bg-surface" />
            </div>
            <div className="h-6 w-20 rounded-full bg-surface" />
            <div className="h-5 w-24 rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
