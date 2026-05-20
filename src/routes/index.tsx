import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl">Ledger</span>
        <Link to="/login" className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-6xl leading-tight md:text-7xl">
          Your bank SMS, <em className="text-primary not-italic">finally</em> a ledger.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Paste transaction SMS from Kotak, HDFC, ICICI, SBI, Axis and more.
          Ledger parses bank, amount, type, merchant — and asks you to categorize each day.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/login" className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground">
            Start tracking
          </Link>
          <a href="#how" className="rounded-full border border-border px-7 py-3 text-sm font-medium">
            How it works
          </a>
        </div>
        <div id="how" className="mt-24 grid gap-6 text-left md:grid-cols-3">
          {[
            { t: "Paste SMS", d: "Drop one or many bank SMS into the importer. Blank lines separate messages." },
            { t: "Auto-detect", d: "Regex parsers for the major Indian banks + an AI fallback for the long tail." },
            { t: "Categorize daily", d: "Open the app each day and tag yesterday's spend in seconds." },
          ].map((b) => (
            <div key={b.t} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-display text-2xl">{b.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
