/**
 * Legacy no-op scheduler shim.
 *
 * The simulation system now runs in manual-tick mode and does not create
 * background cron jobs. These exports remain for backward compatibility.
 */

export function registerSession(session: {
  id: string;
  status: string;
  interval: string;
  intervalMin?: number | null;
}) {
  void session;
}

export function unregisterSession(sessionId: string) {
  void sessionId;
}

export async function startScheduler() {
  return;
}
