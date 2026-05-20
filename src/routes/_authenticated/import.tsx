import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { parseSms, splitSmsBlob, type ParsedTxn } from "@/lib/sms-parser";
import { aiParseSms, saveTransactions } from "@/lib/transactions.functions";

export const Route = createFileRoute("/_authenticated/import")({ component: ImportPage });

type Row = { raw: string; parsed: ParsedTxn | null; status: "pending" | "ai" | "fail" };

const SAMPLE = `Sent Rs.60.00 from Kotak Bank AC X6096 to 7406066506-3@ybl on 20-05-26.UPI Ref 123431379836. Not you, https://kotak.com/KBANKT/Fraud

ICICI Bank Acct XX123 debited for Rs 1200 on 18-May-26; ZOMATO credited. UPI:556677889900`;

function ImportPage() {
  const navigate = useNavigate();
  const aiFn = useServerFn(aiParseSms);
  const saveFn = useServerFn(saveTransactions);
  const [blob, setBlob] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function runParse() {
    const messages = splitSmsBlob(blob);
    if (messages.length === 0) { toast.error("Paste some SMS first"); return; }
    setBusy(true);
    const initial: Row[] = messages.map((m) => ({ raw: m, parsed: parseSms(m), status: "pending" }));
    setRows(initial);

    // Run AI fallback for any that failed regex
    const next = [...initial];
    for (let i = 0; i < next.length; i++) {
      if (next[i].parsed) continue;
      try {
        const res = await aiFn({ data: { sms: next[i].raw } });
        if (res?.parsed) {
          next[i] = { ...next[i], parsed: res.parsed as ParsedTxn, status: "ai" };
        } else {
          next[i] = { ...next[i], status: "fail" };
        }
        setRows([...next]);
      } catch (e) {
        console.error(e);
        next[i] = { ...next[i], status: "fail" };
        setRows([...next]);
      }
    }
    setBusy(false);
    toast.success(`Parsed ${next.filter((r) => r.parsed).length} of ${next.length}`);
  }

  async function save() {
    const toSave = rows.filter((r) => r.parsed).map((r) => ({
      bank: r.parsed!.bank, account_last4: r.parsed!.account_last4, type: r.parsed!.type,
      amount: r.parsed!.amount, currency: r.parsed!.currency, txn_datetime: r.parsed!.txn_datetime,
      counterparty: r.parsed!.counterparty, reference: r.parsed!.reference, raw_sms: r.parsed!.raw_sms,
      source: "sms_paste" as const,
    }));
    if (toSave.length === 0) { toast.error("Nothing to save"); return; }
    setBusy(true);
    try {
      const res = await saveFn({ data: { transactions: toSave, raw_blob: blob } });
      toast.success(`Saved ${res.inserted}${res.skipped ? `, skipped ${res.skipped} duplicates` : ""}`);
      navigate({ to: "/transactions" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl">Import SMS</h1>
        <p className="mt-1 text-muted-foreground">Paste one or many bank SMS. Blank line between messages.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <textarea value={blob} onChange={(e) => setBlob(e.target.value)} rows={10}
          placeholder={SAMPLE}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={runParse} disabled={busy || !blob.trim()}
            className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Parsing…" : "Parse"}
          </button>
          <button onClick={() => setBlob(SAMPLE)} className="rounded-full border border-border px-6 py-2 text-sm">
            Load sample
          </button>
          {rows.length > 0 && (
            <button onClick={save} disabled={busy}
              className="ml-auto rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Save {rows.filter((r) => r.parsed).length} transactions
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${r.parsed ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"}`}>
              {r.parsed ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.parsed.type === "debit" ? "bg-[color:var(--debit)]/15 text-[color:var(--debit)]" : "bg-[color:var(--credit)]/15 text-[color:var(--credit)]"}`}>
                    {r.parsed.type}
                  </span>
                  <span className="font-mono text-lg">₹{r.parsed.amount.toLocaleString("en-IN")}</span>
                  <span className="text-muted-foreground">{r.parsed.bank}{r.parsed.account_last4 ? ` ····${r.parsed.account_last4}` : ""}</span>
                  <span>→ {r.parsed.counterparty ?? "?"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.parsed.txn_datetime).toLocaleDateString("en-IN")}</span>
                  {r.status === "ai" && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase">AI</span>}
                </div>
              ) : (
                <div>
                  <p className="text-xs uppercase tracking-wide text-destructive">{r.status === "fail" ? "Could not parse" : "Parsing…"}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{r.raw}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
