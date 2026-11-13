// Starts the daily reminder job inside the server process. Set REMINDERS_DISABLED=1 to keep a second instance
// (for example a test copy on the same database) from sending.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.REMINDERS_DISABLED === "1") return;
  const { reminderTick } = await import("./lib/server/reminders");
  const tick = () => reminderTick().catch((e) => console.error("Reminders failed:", (e as Error).message));
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
}
