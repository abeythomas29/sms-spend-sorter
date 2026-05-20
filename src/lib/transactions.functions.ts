import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "./ai-gateway";

const ParsedTxnInput = z.object({
  bank: z.string().nullable().optional(),
  account_last4: z.string().nullable().optional(),
  type: z.enum(["debit", "credit"]),
  amount: z.number().positive(),
  currency: z.string().default("INR"),
  txn_datetime: z.string(),
  counterparty: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  raw_sms: z.string().nullable().optional(),
  source: z.enum(["sms_paste", "sms_auto", "manual"]).default("sms_paste"),
});

export const saveTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ transactions: z.array(ParsedTxnInput).min(1).max(200), raw_blob: z.string().optional() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const rows = data.transactions.map((t) => ({
      ...t,
      user_id: userId,
      bank: t.bank ?? null,
      account_last4: t.account_last4 ?? null,
      counterparty: t.counterparty ?? null,
      reference: t.reference ?? null,
      category_id: t.category_id ?? null,
      notes: t.notes ?? null,
      raw_sms: t.raw_sms ?? null,
      confirmed: !!t.category_id,
    }));

    // Upsert with onConflict to dedupe on (user_id, reference, amount)
    const { data: inserted, error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "user_id,reference,amount", ignoreDuplicates: true })
      .select();

    if (error) {
      console.error("saveTransactions error", error);
      throw new Error(error.message);
    }

    if (data.raw_blob) {
      await supabase.from("sms_imports").insert({
        user_id: userId,
        raw_text: data.raw_blob,
        parsed_count: rows.length,
        unparsed_count: 0,
      });
    }

    return { inserted: inserted?.length ?? 0, skipped: rows.length - (inserted?.length ?? 0) };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        category_id: z.string().uuid().nullable().optional(),
        notes: z.string().nullable().optional(),
        confirmed: z.boolean().optional(),
        amount: z.number().positive().optional(),
        counterparty: z.string().nullable().optional(),
        type: z.enum(["debit", "credit"]).optional(),
      }),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("transactions")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("transactions").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// AI fallback parser for an SMS that didn't match any regex
export const aiParseSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sms: z.string().min(5).max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const schema = {
      type: "object",
      properties: {
        is_transaction: { type: "boolean", description: "Is this an actual bank transaction (not OTP/balance/promo)?" },
        bank: { type: "string", description: "Bank name e.g. Kotak, HDFC, ICICI, SBI, Axis" },
        type: { type: "string", enum: ["debit", "credit"] },
        amount: { type: "number" },
        currency: { type: "string" },
        account_last4: { type: "string", description: "Last 4 chars of account/card" },
        counterparty: { type: "string", description: "Merchant, VPA, or person name" },
        txn_datetime: { type: "string", description: "ISO 8601 if found, else empty string" },
        reference: { type: "string", description: "UPI ref / txn id if present" },
        confidence: { type: "number", description: "0-1 confidence" },
      },
      required: ["is_transaction", "type", "amount"],
      additionalProperties: false,
    };

    const result = await callAiJson<{
      is_transaction: boolean;
      bank?: string;
      type?: "debit" | "credit";
      amount?: number;
      currency?: string;
      account_last4?: string;
      counterparty?: string;
      txn_datetime?: string;
      reference?: string;
      confidence?: number;
    }>({
      system:
        "You extract transaction details from Indian bank SMS messages. Return only structured data. " +
        "If the message is an OTP, balance enquiry, promo, or bill reminder, set is_transaction=false. " +
        "Amount must be a positive number with no currency symbol.",
      user: `Parse this SMS:\n\n${data.sms}`,
      schema,
    });

    if (!result || !result.is_transaction || !result.amount) return { parsed: null };

    return {
      parsed: {
        bank: result.bank ?? "Unknown",
        account_last4: result.account_last4 ?? null,
        type: result.type ?? "debit",
        amount: result.amount,
        currency: result.currency ?? "INR",
        txn_datetime: result.txn_datetime || new Date().toISOString(),
        counterparty: result.counterparty ?? null,
        reference: result.reference ?? null,
        raw_sms: data.sms,
        matched_by: "ai-fallback",
        confidence: result.confidence ?? 0.5,
      },
    };
  });

// Suggest a category for a counterparty/merchant
export const suggestCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      counterparty: z.string().min(1).max(300),
      txn_type: z.enum(["debit", "credit"]),
      amount: z.number().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // First check user's existing merchant rules
    const { data: rules } = await supabase
      .from("merchant_rules")
      .select("match_text, category_id, categories(name)")
      .eq("user_id", userId);

    const cp = data.counterparty.toLowerCase();
    for (const r of rules ?? []) {
      if (cp.includes(r.match_text.toLowerCase())) {
        return { category_id: r.category_id, source: "rule" as const };
      }
    }

    // Get user's categories
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", userId);

    const candidates = (cats ?? []).filter((c) =>
      data.txn_type === "credit" ? c.kind === "income" || c.kind === "transfer" : c.kind === "expense" || c.kind === "transfer"
    );

    if (candidates.length === 0) return { category_id: null, source: "none" as const };

    const result = await callAiJson<{ category_name: string; confidence: number }>({
      system:
        "You categorize Indian bank transactions. Given a counterparty/VPA/merchant string and a list of categories, pick the single best matching category by name. Return only one of the given names.",
      user: `Counterparty: "${data.counterparty}"\nType: ${data.txn_type}\nAmount: ${data.amount ?? "?"}\n\nCategories: ${candidates.map((c) => c.name).join(", ")}\n\nRespond as JSON: {"category_name": "<one of the above>", "confidence": 0..1}`,
    });

    if (!result?.category_name) return { category_id: null, source: "none" as const };
    const match = candidates.find((c) => c.name.toLowerCase() === result.category_name.toLowerCase());
    return { category_id: match?.id ?? null, source: "ai" as const };
  });
