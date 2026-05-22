import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Inbox, ListOrdered, LogOut } from "lucide-react";
import { useAuth, signOut } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/import", label: "Import SMS", icon: Inbox },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
] as const;

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/dashboard" className="font-display text-2xl">Ledger</Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = loc.pathname === n.to;
              return (
                <Link key={n.to} to={n.to}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <button onClick={() => signOut()} className="ml-2 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10"><Outlet /></main>
      <footer className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
      </footer>
    </div>
  );
}
