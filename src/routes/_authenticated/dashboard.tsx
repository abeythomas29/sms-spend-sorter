import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type Txn = {
  id: string; amount: number; type: "debit" | "credit"; txn_datetime: string;
  bank: string | null; counterparty: string | null; confirmed: boolean;
  category_id: string | null;
  categories: { name: string; color: string } | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function Dashboard() {
  const { user } = useAuth();
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["txns-month", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, type, txn_datetime, bank, counterparty, confirmed, category_id, categories(name,color)")
        .gte("txn_datetime", start.toISOString())
        .order("txn_datetime", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Txn[];
    },
  });

  const spend = txns.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const income = txns.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const uncategorized = txns.filter((t) => !t.category_id).length;

  const byCat = new Map<string, { name: string; color: string; total: number }>();
  for (const t of txns) {
    if (t.type !== "debit") continue;
    const name = t.categories?.name ?? "Uncategorized";
    const color = t.categories?.color ?? "#6b7280";
    const cur = byCat.get(name) ?? { name, color, total: 0 };
    cur.total += Number(t.amount);
    byCat.set(name, cur);
  }
  const catData = Array.from(byCat.values()).sort((a, b) => b.total - a.total);

  // Daily trend
  const days = new Map<string, { day: string; spend: number; income: number }>();
  for (const t of txns) {
    const day = t.txn_datetime.slice(0, 10);
    const cur = days.get(day) ?? { day: day.slice(5), spend: 0, income: 0 };
    if (t.type === "debit") cur.spend += Number(t.amount);
    else cur.income += Number(t.amount);
    days.set(day, cur);
  }
  const trend = Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-5xl">This month</h1>
        <p className="mt-1 text-muted-foreground">{start.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card label="Spend" value={fmt(spend)} accent="text-[color:var(--debit)]" />
        <Card label="Income" value={fmt(income)} accent="text-[color:var(--credit)]" />
        <Card label="Net" value={fmt(income - spend)} accent={income - spend >= 0 ? "text-[color:var(--credit)]" : "text-[color:var(--debit)]"} />
      </div>

      {uncategorized > 0 && (
        <Link to="/transactions" className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
          <span><strong>{uncategorized}</strong> transactions need a category</span>
          <span className="text-primary">Categorize →</span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Spend by category">
          {catData.length === 0 ? <Empty /> : (
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={catData} dataKey="total" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {catData.map((c) => <Cell key={c.name} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {catData.slice(0, 6).map((c) => (
              <li key={c.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> {c.name}</span>
                <span className="font-mono text-xs">{fmt(c.total)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Daily trend">
          {trend.length === 0 ? <Empty /> : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Bar dataKey="spend" fill="var(--debit)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="income" fill="var(--credit)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {txns.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">No transactions yet this month.</p>
          <Link to="/import" className="mt-4 inline-block rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
            Import SMS
          </Link>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-4xl ${accent}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="py-12 text-center text-sm text-muted-foreground">No data yet</p>;
}
