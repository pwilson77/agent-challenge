"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
              Application error
            </p>
            <h1 className="mt-4 text-3xl font-bold">Something went wrong</h1>
            <p className="mt-4 text-slate-300">
              The app hit an unexpected error while rendering this page.
            </p>
            {error.digest ? (
              <p className="mt-4 text-sm text-slate-400">
                Error digest: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-8 inline-flex items-center justify-center rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
