// SMS parser for Indian bank transaction SMS.
// Returns a normalized ParsedTxn or null when the message is not a transaction.
// Filters out OTPs, balance enquiries, promo/marketing and bill-due reminders.

export type ParsedTxn = {
  bank: string;
  account_last4: string | null;
  type: "debit" | "credit";
  amount: number;
  currency: string;
  txn_datetime: string; // ISO
  counterparty: string | null;
  reference: string | null;
  raw_sms: string;
  matched_by: string; // which rule matched (for debugging)
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseAmount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

// Accepts DD-MM-YY, DD/MM/YY, DD-MM-YYYY, DD-Mon-YY, DDMMMYY
function parseDate(s: string | null | undefined): string {
  if (!s) return new Date().toISOString();
  const cleaned = s.trim();

  // DDMMMYY  e.g. 20MAY26
  let m = cleaned.match(/^(\d{1,2})([A-Za-z]{3})(\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mon = MONTHS[m[2].toLowerCase()];
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mon != null) return new Date(yr, mon, day, 12).toISOString();
  }

  // DD-Mon-YY  or  DD-Mon-YYYY
  m = cleaned.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mon = MONTHS[m[2].toLowerCase()];
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mon != null) return new Date(yr, mon, day, 12).toISOString();
  }

  // DD-MM-YY or DD/MM/YY or DD-MM-YYYY
  m = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mon = +m[2] - 1;
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(yr, mon, day, 12).toISOString();
  }

  return new Date().toISOString();
}

function isPromotional(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(otp|one[- ]time password|verification code)\b/.test(t)) return true;
  if (/\bavl\s*(bal|balance)\b/.test(t) && !/(debited|credited|sent|received|spent)/.test(t)) return true;
  if (/(loan|emi|insurance|offer|discount|cashback|reward).*click|apply now|visit/.test(t)) return true;
  return false;
}

type Rule = {
  bank: string;
  type: "debit" | "credit";
  name: string;
  regex: RegExp;
  fields: (m: RegExpMatchArray) => {
    amount: string;
    account?: string;
    counterparty?: string;
    date?: string;
    reference?: string;
  };
};

const RULES: Rule[] = [
  // ---------- KOTAK ----------
  {
    bank: "Kotak", type: "debit", name: "kotak-upi-debit",
    regex: /Sent\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+from\s+Kotak\s+Bank\s+AC\s+(X?\w+)\s+to\s+(\S+?)\s+on\s+([\d\-\/]+).*?Ref\s*(\d+)/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4], reference: m[5] }),
  },
  {
    bank: "Kotak", type: "credit", name: "kotak-upi-credit",
    regex: /Received\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+in\s+Kotak\s+Bank\s+AC\s+(X?\w+)\s+from\s+(\S+?)(?:\s+on\s+([\d\-\/]+))?.*?(?:Ref\s*(\d+))?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4], reference: m[5] }),
  },

  // ---------- HDFC ----------
  {
    bank: "HDFC", type: "debit", name: "hdfc-upi-debit",
    regex: /Sent\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+From\s+HDFC\s+Bank\s+A\/C\s+\*?(\w+)\s+To\s+(.+?)\s+On\s+([\d\-\/]+)(?:.*?Ref\s*(\w+))?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4], reference: m[5] }),
  },
  {
    bank: "HDFC", type: "debit", name: "hdfc-card-debit",
    regex: /Spent\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+On\s+HDFC\s+Bank\s+(?:Credit\s+)?Card\s+\*?(\w+)\s+At\s+(.+?)\s+On\s+([\d\-\/]+)/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4] }),
  },
  {
    bank: "HDFC", type: "credit", name: "hdfc-credit",
    regex: /Rs\.?\s*([\d,]+(?:\.\d+)?)\s+Credited\s+to\s+(?:A\/C|HDFC Bank A\/C)\s+\*?(\w+)\s+by\s+(\S+?)(?:\s+on\s+([\d\-\/]+))?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4] }),
  },

  // ---------- ICICI ----------
  {
    bank: "ICICI", type: "debit", name: "icici-debit",
    regex: /ICICI\s+Bank\s+(?:Acct|Account)\s+(\w+)\s+debited\s+(?:for|with)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+on\s+([\d\-\/A-Za-z]+);?\s*(.+?)\s+(?:credited|charged|paid)?\.?\s*(?:UPI[:\s]*(\w+))?/i,
    fields: (m) => ({ account: m[1], amount: m[2], date: m[3], counterparty: m[4], reference: m[5] }),
  },
  {
    bank: "ICICI", type: "credit", name: "icici-credit",
    regex: /ICICI\s+Bank\s+(?:Acct|Account)\s+(\w+)\s+credited\s+with\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+on\s+([\d\-\/A-Za-z]+);?\s*(.+?)(?:\.|$)/i,
    fields: (m) => ({ account: m[1], amount: m[2], date: m[3], counterparty: m[4] }),
  },

  // ---------- SBI ----------
  {
    bank: "SBI", type: "debit", name: "sbi-upi-debit",
    regex: /(?:Dear\s+(?:UPI\s+user|SBI\s+user)[, ]+)?A\/?[Cc]\s+(X?\w+)\s+debited\s+(?:by|for)\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s+on\s+(?:date\s+)?([\d\-\/A-Za-z]+)\s+(?:trf\s+to|to)\s+(.+?)(?:\s+Refno\s+(\w+))?/i,
    fields: (m) => ({ account: m[1], amount: m[2], date: m[3], counterparty: m[4], reference: m[5] }),
  },
  {
    bank: "SBI", type: "credit", name: "sbi-credit",
    regex: /(?:Dear\s+SBI\s+user[, ]+)?A\/?[Cc]\s+(X?\w+)\s+credited\s+by\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+on\s+([\d\-\/A-Za-z]+)(?:.*?(?:by|from)\s+(.+?))?(?:\.|$)/i,
    fields: (m) => ({ account: m[1], amount: m[2], date: m[3], counterparty: m[4] }),
  },

  // ---------- AXIS ----------
  {
    bank: "Axis", type: "debit", name: "axis-card-debit",
    regex: /Spent\s+(?:Card\s+no\.?\s*)?(\w+)?\s*INR\s+([\d,]+(?:\.\d+)?)\s+([\d\-\/]+)\s+(.+?)(?:\.\s*Avl|$)/i,
    fields: (m) => ({ account: m[1], amount: m[2], date: m[3], counterparty: m[4] }),
  },
  {
    bank: "Axis", type: "debit", name: "axis-upi-debit",
    regex: /Debit\s+INR\s+([\d,]+(?:\.\d+)?)\s+A\/c\s+no\s+(\w+)\s+(.+?)\s+UPI\/?(\w+)?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], reference: m[4] }),
  },
  {
    bank: "Axis", type: "credit", name: "axis-credit",
    regex: /INR\s+([\d,]+(?:\.\d+)?)\s+credited\s+to\s+A\/c\s+no\s+(\w+)\s+on\s+([\d\-\/]+)(?:.*?(?:by|from)\s+(.+?))?(?:\.|$)/i,
    fields: (m) => ({ amount: m[1], account: m[2], date: m[3], counterparty: m[4] }),
  },

  // ---------- GENERIC FALLBACK (any bank, debit) ----------
  {
    bank: "Unknown", type: "debit", name: "generic-debit",
    regex: /(?:debited|spent|sent|paid|withdrawn)[^\d]*(?:Rs\.?|INR)\s*([\d,]+(?:\.\d+)?).*?(?:A\/?c|account|card)?\s*(?:no\.?\s*)?\*?(\w{3,6})?.*?(?:to|at|for)\s+(.+?)(?:\s+on\s+([\d\-\/A-Za-z]+))?(?:.*?(?:Ref|UPI|Txn)[:\s]*(\w+))?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4], reference: m[5] }),
  },
  {
    bank: "Unknown", type: "credit", name: "generic-credit",
    regex: /(?:credited|received|deposited)[^\d]*(?:Rs\.?|INR)\s*([\d,]+(?:\.\d+)?).*?(?:A\/?c|account)?\s*(?:no\.?\s*)?\*?(\w{3,6})?.*?(?:from|by)\s+(.+?)(?:\s+on\s+([\d\-\/A-Za-z]+))?/i,
    fields: (m) => ({ amount: m[1], account: m[2], counterparty: m[3], date: m[4] }),
  },
];

// Detect bank from sender header / body keywords to bias the parser
function detectBank(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("kotak")) return "Kotak";
  if (t.includes("hdfc")) return "HDFC";
  if (t.includes("icici")) return "ICICI";
  if (t.includes("sbi") || t.includes("state bank")) return "SBI";
  if (t.includes("axis")) return "Axis";
  if (t.includes("yes bank")) return "Yes";
  if (t.includes("indusind")) return "IndusInd";
  if (t.includes("pnb") || t.includes("punjab national")) return "PNB";
  if (t.includes("bob") || t.includes("baroda")) return "BOB";
  return null;
}

function cleanCounterparty(s: string | undefined | null): string | null {
  if (!s) return null;
  return s
    .replace(/\s*\.\s*$/, "")
    .replace(/^\s*(to|from|at|by)\s+/i, "")
    .replace(/\s+(on|ref|upi).*$/i, "")
    .trim()
    .slice(0, 120) || null;
}

function cleanAccount(s: string | undefined | null): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}

export function parseSms(rawText: string): ParsedTxn | null {
  if (!rawText || rawText.length < 10) return null;
  const text = rawText.replace(/\s+/g, " ").trim();
  if (isPromotional(text)) return null;

  const detectedBank = detectBank(text);

  // Try bank-specific rules first when detected, else all rules in order
  const ordered = detectedBank
    ? [...RULES.filter((r) => r.bank === detectedBank), ...RULES.filter((r) => r.bank !== detectedBank)]
    : RULES;

  for (const rule of ordered) {
    const m = text.match(rule.regex);
    if (!m) continue;
    const f = rule.fields(m);
    const amount = parseAmount(f.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    return {
      bank: rule.bank === "Unknown" ? (detectedBank ?? "Unknown") : rule.bank,
      account_last4: cleanAccount(f.account),
      type: rule.type,
      amount,
      currency: "INR",
      txn_datetime: parseDate(f.date),
      counterparty: cleanCounterparty(f.counterparty),
      reference: f.reference?.trim() || null,
      raw_sms: rawText.trim(),
      matched_by: rule.name,
    };
  }

  return null;
}

// Split a pasted blob into individual SMS messages.
// Uses blank lines as primary separator, falls back to line-by-line.
export function splitSmsBlob(blob: string): string[] {
  const trimmed = blob.trim();
  if (!trimmed) return [];
  // Prefer blank-line split
  const blocks = trimmed.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  // Otherwise treat each non-empty line as a message
  return trimmed.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 10);
}
