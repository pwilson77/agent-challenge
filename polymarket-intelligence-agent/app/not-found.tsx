import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          404
        </p>
        <h1 className="mt-4 text-3xl font-bold text-slate-100">
          Page not found
        </h1>
        <p className="mt-4 text-slate-300">
          The page you requested does not exist or is no longer available.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
