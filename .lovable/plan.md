# SMS Expense Tracker — Web App + Capacitor Android Wrapper

A web app (works in any browser) that doubles as a real Android app via Capacitor. On Android, it **auto-reads bank SMS in the background**. In a browser, you paste SMS in manually. Same parser, same dashboards, same database — one codebase.

## How SMS parsing works

**Layer 1 — Regex rules per bank** (deterministic, free, instant):

| Bank | Sample SMS shape |
|---|---|
| Kotak | `Sent Rs.60.00 from Kotak Bank AC X6096 to 7406066506-3@ybl on 20-05-26.UPI Ref 123431379836` |
| HDFC | `Sent Rs.X From HDFC Bank A/C *NNNN To <name> On <date> Ref <ref>` |
| ICICI | `ICICI Bank Acct XXNNN debited for Rs X on DD-Mon-YY; <merchant> credited. UPI:<ref>` |
| SBI | `Dear UPI user A/C XNNNN debited by X on date DDMMMYY trf to <name> Refno <ref>` |
| Axis | `Spent Card no.XXNN INR X DD-MM-YY <merchant>` |

Each rule extracts: `bank`, `account_last4`, `type` (debit/credit), `amount`, `datetime`, `counterparty` (VPA / merchant), `reference`.

**Layer 2 — AI fallback** via Lovable AI Gateway (`google/gemini-3-flash-preview`) with strict JSON schema. Used when regex misses, and to auto-suggest a category (Food, Travel, Bills, Salary, Transfer, etc.) from the counterparty/VPA.

**Filter:** OTP / balance / promo SMS (no debit/credit verb + no amount) are skipped.

## Capacitor Android integration

The web app **detects the platform at runtime**:

- **Browser** → manual paste page is the entry point.
- **Android (Capacitor)** → on launch, requests `READ_SMS` permission, reads inbox since last sync, and registers a background broadcast receiver for new SMS. Each detected bank SMS is parsed locally and pushed to Lovable Cloud via the same API the paste flow uses.

Native bridge code (TypeScript):
```ts
import { Capacitor } from '@capacitor/core';
import { SMSInboxReader } from '@capacitor-community/sms-inbox';

if (Capacitor.getPlatform() === 'android') {
  await SMSInboxReader.requestPermissions();
  const { smsList } = await SMSInboxReader.getSMSList({
    filter: { minDate: lastSyncTimestamp },
  });
  for (const sms of smsList) {
    const parsed = parseSms(sms.body); // shared web parser
    if (parsed) await saveTransaction(parsed);
  }
}
```

Capacitor config (`capacitor.config.ts`):
- App ID: `app.lovable.expensetracker` (you can rename)
- `server.androidScheme: 'https'`, `server.url` points to your published Lovable URL (so updates ship instantly — no rebuild needed for UI changes)
- `AndroidManifest.xml`: `READ_SMS`, `RECEIVE_SMS` permissions

You build the APK once on your machine (Android Studio). After that, **web app updates auto-flow to the installed Android app** because Capacitor loads the live published URL. Native rebuild only needed when changing permissions or plugins.

## Pages

1. **Inbox / Paste SMS** — browser entry. Big textarea, paste many SMS, review parsed fields, confirm. On Android this page also shows "Auto-import on" status.
2. **Transactions** — table with filters (bank, account, category, type, date), inline edit, delete, CSV export.
3. **Dashboard** — modeled on your Google Sheet: monthly spend vs income, category pie, top merchants, bank breakdown, daily trend (Recharts).
4. **Daily check-in modal** — on app open, lists yesterday's uncategorized txns and asks "what type of spend?" + notes — your original requirement.
5. **Categories & Rules** — manage categories; create merchant rules (e.g. `ZOMATO → Food`) that auto-apply to future txns.
6. **Settings** — account, default currency, last sync timestamp, "Re-scan inbox" button (Android only).

## Data model (Lovable Cloud / Postgres + RLS)

- `transactions` — id, user_id, bank, account_last4, type, amount, currency, txn_datetime, counterparty, reference, category_id, notes, raw_sms, source (`sms_paste` | `sms_auto` | `manual`), confirmed, created_at — **unique index on (user_id, reference, amount) to dedupe**
- `categories` — id, user_id, name, color, icon, kind (expense|income|transfer)
- `merchant_rules` — id, user_id, match_text, category_id
- `sms_imports` — id, user_id, raw_text, parsed_count, unparsed_count, created_at

RLS on every table; email + password auth via Lovable Cloud.

## Tech stack

- TanStack Start + React + Tailwind + shadcn/ui
- Lovable Cloud (Postgres, auth, server functions)
- Lovable AI Gateway (parse fallback + category suggestions)
- Recharts (dashboards)
- Capacitor + `@capacitor-community/sms-inbox` (Android wrapper)

## Build order (inside Lovable)

1. Enable Lovable Cloud; create schema + RLS; seed default categories
2. SMS parser module (regex per bank, unit-tested against your Kotak sample + HDFC/ICICI/SBI/Axis samples)
3. Auth + Paste SMS page with parse → review → confirm → save flow
4. AI fallback server function for unmatched SMS + category suggestion
5. Transactions page (filters, edit, delete, CSV export)
6. Dashboard with Recharts mirroring your Google Sheet
7. Daily check-in modal + merchant auto-rules
8. Platform detection + Capacitor bridge module (no-op in browser, active on Android)
9. Capacitor config, Android manifest permissions, README with build steps

## What you do after Lovable ships it

One-time, on your local machine:
```
npm install
npx cap add android
npx cap sync
npx cap open android    # Android Studio → Build → APK → install on your phone
```
Needs Android Studio + JDK. ~30 min the first time. After that, web updates flow live; you only rebuild the APK if permissions/plugins change.

## Honest caveats

- **Google Play Store will likely reject** `READ_SMS` for a personal expense app (policy since 2019). **Sideload the APK to your own phone** — totally fine, just enable "Install unknown apps".
- **iOS not supported** — Apple blocks SMS access for all third-party apps. The web app still works on iPhone via browser/paste.
- Background SMS reading requires the app to have been opened at least once after install (Android lifecycle).

## Out of scope

- iOS SMS auto-read (impossible)
- Push notifications for every transaction (would need FCM setup)
- Multi-currency conversion (single currency per user for v1)

---

Ready to build? If you can paste 2–3 more real SMS samples from HDFC / ICICI / SBI / other banks you use before I start, the day-one regex accuracy will be much higher.
