import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { updateTransaction, deleteTransaction } from "@/lib/transactions.functions";

export const Route = createFileRoute("/_authenticated/transactions")({ component: TxnsPage });

type Txn = {
  id: string; amount: number; type: "debit" | "credit"; txn_datetime: string;
  bank: string | null; account_last4: string | null; counterparty: string | null;
  notes: string | null; category_id: string | null; confirmed: boolean; raw_sms: string | null;
};
type Cat = { id: string; name: string; color: string; kind: "expense" | "income" | "transfer" };

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function TxnsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateTransaction);
  const deleteFn = useServerFn(deleteTransaction);
  const [filter, setFilter] = useState<"all" | "uncategorized" | "debit" | "credit">("all");

  const { data: txns = [] } = useQuery({
    queryKey: ["txns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions").select("*").order("txn_datetime", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Txn[];
    },
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["cats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Cat[];
    },
  });

  const shown = txns.filter((t) => {
    if (filter === "uncategorized") return !t.category_id;
    if (filter === "debit" || filter === "credit") return t.type === filter;
    return true;
  });

  async function setCategory(id: string, category_id: string | null) {
    await updateFn({ data: { id, patch: { category_id, confirmed: !!category_id } } });
    qc.invalidateQueries({ queryKey: ["txns"] });
    qc.invalidateQueries({ queryKey: ["txns-month"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["txns"] });
    qc.invalidateQueries({ queryKey: ["txns-month"] });
    toast.success("Deleted");
  }

  function exportCsv() {
    const header = ["Date", "Type", "Amount", "Bank", "Account", "Counterparty", "Category", "Notes"];
    const lines = [header.join(",")];
    for (const t of shown) {
      const cat = cats.find((c) => c.id === t.category_id)?.name ?? "";
      lines.push([
        new Date(t.txn_datetime).toISOString().slice(0, 10),
        t.type, t.amount, t.bank ?? "", t.account_last4 ?? "",
        `"${(t.counterparty ?? "").replace(/"/g, '""')}"`,
        cat, `"${(t.notes ?? "").replace(/"/g, '""')}"`,
      ].join(","));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl">Transactions</h1>
          <p className="mt-1 text-muted-foreground">{shown.length} of {txns.length} shown</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "uncategorized", "debit", "credit"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs ${filter === f ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {f}
            </button>
          ))}
          <button onClick={exportCsv} className="rounded-full border border-border px-4 py-1.5 text-xs">Export CSV</button>
        </div>
      </div>

      <div className="space-y-2">
        {shown.map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          const relevantCats = cats.filter((c) => t.type === "credit" ? c.kind !== "expense" : c.kind !== "income");
          return (
            <div key={t.id} className="grid grid-cols-1 items-center gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[auto_1fr_auto_auto_auto]">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.type === "debit" ? "bg-[color:var(--debit)]/15 text-[color:var(--debit)]" : "bg-[color:var(--credit)]/15 text-[color:var(--credit)]"}`}>
                {t.type}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm">{t.counterparty ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.bank}{t.account_last4 ? ` ····${t.account_last4}` : ""} · {new Date(t.txn_datetime).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>
              <span className={`font-mono text-lg ${t.type === "debit" ? "text-[color:var(--debit)]" : "text-[color:var(--credit)]"}`}>
                {t.type === "debit" ? "-" : "+"}{fmt(Number(t.amount))}
              </span>
              <select value={t.category_id ?? ""} onChange={(e) => setCategory(t.id, e.target.value || null)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                style={{ borderLeft: cat ? `4px solid ${cat.color}` : undefined }}>
                <option value="">Uncategorized</option>
                {relevantCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => remove(t.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No transactions match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
