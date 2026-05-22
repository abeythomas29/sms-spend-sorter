import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-2xl">Ledger</Link>
        <Link to="/login" className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 22, 2026</p>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <div>
            <h2 className="font-display text-xl">1. Information We Collect</h2>
            <p className="mt-2 text-muted-foreground">
              Ledger collects the following data to provide expense tracking functionality:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li><strong>Account information:</strong> Email address and authentication credentials managed by our backend provider.</li>
              <li><strong>SMS content:</strong> On Android, the app reads bank transaction SMS with your permission to extract amounts, merchants, dates, and transaction references. SMS content is never stored in raw form — only parsed transaction fields are saved.</li>
              <li><strong>Parsed transaction data:</strong> Bank name, account suffix, amount, type (debit/credit), counterparty/merchant, date/time, reference number, and category.</li>
              <li><strong>Categories and rules:</strong> Custom categories and merchant matching rules you create to auto-categorize transactions.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl">2. How We Use Your Data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Parse bank SMS into structured transaction records.</li>
              <li>Display dashboards, spend summaries, and category breakdowns.</li>
              <li>Apply your merchant-to-category rules for future transactions.</li>
              <li>Provide daily check-in prompts for uncategorized transactions.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl">3. Data Storage & Security</h2>
            <p className="mt-2 text-muted-foreground">
              Your data is stored in a secure cloud database (Postgres) with Row-Level Security (RLS) policies that ensure only you can access your own records. All API calls are authenticated with JWT tokens. We do not store raw SMS bodies permanently — only parsed fields are retained.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl">4. Data Sharing</h2>
            <p className="mt-2 text-muted-foreground">
              We do not sell, rent, or share your personal or financial data with third parties. Parsed transaction data is processed entirely within our own backend infrastructure.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl">5. SMS Permissions (Android)</h2>
            <p className="mt-2 text-muted-foreground">
              The Android app requests <code>READ_SMS</code> permission to read bank SMS from your inbox. This is used solely to extract transaction details. You can revoke this permission at any time via Android system settings and continue using the app with manual SMS paste.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl">6. Children's Privacy</h2>
            <p className="mt-2 text-muted-foreground">
              Ledger is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us immediately and we will delete such information.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl">7. Your Rights</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Export your transaction data as CSV from the app.</li>
              <li>Delete individual transactions or your entire account.</li>
              <li>Revoke SMS permissions at any time from device settings.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl">8. Changes to This Policy</h2>
            <p className="mt-2 text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page with an updated date.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl">9. Contact Us</h2>
            <p className="mt-2 text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us through the app or at the support email provided in the Play Store listing.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">← Back to home</Link>
      </footer>
    </div>
  );
}
