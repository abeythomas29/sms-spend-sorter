import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_transaction: { type: "boolean" },
    name: { type: "string" },
    bank: { type: "string" },
    type: { type: "string", enum: ["debit", "credit"] },
    amount: { type: "string" },
    date: { type: "string" },
    account: { type: "string" },
    counterparty: { type: "string" },
    reference: { type: "string" },
    allowSmsDateFallback: { type: "boolean" },
  },
  required: [
    "is_transaction",
    "name",
    "bank",
    "type",
    "amount",
    "date",
    "account",
    "counterparty",
    "reference",
    "allowSmsDateFallback",
  ],
};

const systemPrompt = `You extract structured transaction data from Indian bank SMS messages.

Rules:
- "type" must be "debit" or "credit".
  - debit = spent, debited, sent, paid, withdrawn, card purchase
  - credit = credited, received, refund, deposited
- "amount" = exact numeric amount as a string, no INR/Rs/₹ symbols, no commas (e.g. "182.00").
- "date" = exact date/time text as it appears in the SMS (e.g. "22 MAY 2026 at 03:32 PM"). If no date present, set "date" to "" and "allowSmsDateFallback" to true; otherwise allowSmsDateFallback = false.
- "account" = exact account/card ending text if present (e.g. "XX2449"), else "".
- "counterparty" = merchant or person name if present, else "".
- "reference" = transaction/UPI/reference number if present, else "".
- "bank" = bank name (e.g. "Kotak", "HDFC", "ICICI", "SBI", "Axis"), else "".
- "name" = always "Bank AI SMS format".
- If the message is not an actual bank transaction (OTP, balance enquiry, promo, bill reminder, statement), set "is_transaction" to false. Otherwise true.`;

export const Route = createFileRoute("/api/teach-sms")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
              { status: 500, headers: jsonHeaders },
            );
          }

          let body: { sample?: unknown };
          try {
            body = await request.json();
          } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
              status: 400,
              headers: jsonHeaders,
            });
          }

          const sample = typeof body.sample === "string" ? body.sample.trim() : "";
          if (sample.length < 15) {
            return new Response(
              JSON.stringify({ error: "SMS sample is too short" }),
              { status: 400, headers: jsonHeaders },
            );
          }
          if (sample.length > 4000) {
            return new Response(
              JSON.stringify({ error: "SMS sample is too long" }),
              { status: 400, headers: jsonHeaders },
            );
          }

          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Parse this SMS:\n\n${sample}` },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "teach_sms",
                  strict: true,
                  schema,
                },
              },
            }),
          });

          if (!openaiRes.ok) {
            const errText = await openaiRes.text();
            console.error("OpenAI error", openaiRes.status, errText);
            return new Response(
              JSON.stringify({ error: `OpenAI error (${openaiRes.status})` }),
              { status: 502, headers: jsonHeaders },
            );
          }

          const data = await openaiRes.json();
          const content: string | undefined = data?.choices?.[0]?.message?.content;
          if (!content) {
            return new Response(
              JSON.stringify({ error: "Empty response from model" }),
              { status: 502, headers: jsonHeaders },
            );
          }

          let parsed: {
            is_transaction: boolean;
            name: string;
            bank: string;
            type: "debit" | "credit";
            amount: string;
            date: string;
            account: string;
            counterparty: string;
            reference: string;
            allowSmsDateFallback: boolean;
          };
          try {
            parsed = JSON.parse(content);
          } catch {
            return new Response(
              JSON.stringify({ error: "Model returned invalid JSON" }),
              { status: 502, headers: jsonHeaders },
            );
          }

          if (!parsed.is_transaction) {
            return new Response(
              JSON.stringify({ error: "SMS is not a bank transaction" }),
              { status: 422, headers: jsonHeaders },
            );
          }

          const result = {
            name: parsed.name || "Bank AI SMS format",
            bank: parsed.bank ?? "",
            type: parsed.type,
            amount: parsed.amount ?? "",
            date: parsed.date ?? "",
            account: parsed.account ?? "",
            counterparty: parsed.counterparty ?? "",
            reference: parsed.reference ?? "",
            allowSmsDateFallback: !!parsed.allowSmsDateFallback,
          };

          return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
        } catch (err) {
          console.error("teach-sms error", err);
          return new Response(
            JSON.stringify({ error: (err as Error).message || "Unknown error" }),
            { status: 500, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
