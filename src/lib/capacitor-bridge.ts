// Lightweight platform detector + SMS bridge stub.
// When the app is wrapped in Capacitor + @capacitor-community/sms-inbox,
// the auto-import flow becomes live. In a browser this is a no-op.

export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
  return w.Capacitor?.getPlatform?.() === "android";
}

export type RawSms = { body: string; date?: number; address?: string };

// Dynamically import the SMS plugin so the web build doesn't fail.
export async function readSmsInbox(sinceMs?: number): Promise<RawSms[]> {
  if (!isAndroidApp()) return [];
  try {
    const mod = (await import(/* @vite-ignore */ "@capacitor-community/sms-inbox").catch(() => null)) as
      | { SMSInboxReader?: { requestPermissions: () => Promise<unknown>; getSMSList: (opts: unknown) => Promise<{ smsList: RawSms[] }> } }
      | null;
    if (!mod?.SMSInboxReader) return [];
    await mod.SMSInboxReader.requestPermissions();
    const { smsList } = await mod.SMSInboxReader.getSMSList({
      filter: sinceMs ? { minDate: sinceMs } : {},
    });
    return smsList ?? [];
  } catch (e) {
    console.warn("SMS inbox read failed", e);
    return [];
  }
}
