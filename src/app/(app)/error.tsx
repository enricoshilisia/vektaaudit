"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">That didn&apos;t work</h1>
      <p className="text-sm text-ink-700">{error.message && !error.digest ? error.message : "Something went wrong. Nothing was changed. Try again, or go back."}</p>
      <div className="flex gap-2">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <button onClick={() => history.back()} className="btn">
          Go back
        </button>
      </div>
    </div>
  );
}
