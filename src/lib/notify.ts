// Fire-and-forget Telegram notification (no-op if Telegram isn't configured)
export async function notify(message: string): Promise<void> {
  try {
    await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    /* ignore — alerts are best-effort */
  }
}
