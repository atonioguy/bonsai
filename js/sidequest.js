// Side Quest bridge: a finished reading session becomes a TickTick focus record through
// Side Quest's own worker (aquamarine-data, POST /focus). Side Quest counts it like a pomodoro.
import * as db from './db.js';
import { shouldLog, finalizeStale } from './logic.js';

export const isConnected = (s) => Boolean(s.sqUrl && s.sqKey);

/** @returns {Promise<'logged'|'off'|'failed'>} */
export async function logSession(session, settings) {
  if (!isConnected(settings)) return 'off';
  try {
    const end = session.end;
    const start = end - session.activeSec * 1000; // the record covers the time actually spent reading
    const r = await fetch(settings.sqUrl.replace(/\/+$/, '') + '/focus', {
      method: 'POST',
      headers: { 'x-aq-key': settings.sqKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        type: session.mode === 'free' ? 1 : 0, // 1 = stopwatch (free read), 0 = pomodoro (timed)
        taskId: null,
        note: 'Bonsai · ' + (session.mode === 'free' ? 'free read · ' : '') + session.bookTitle,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await db.put('sessions', session.id, { ...session, synced: true });
    return 'logged';
  } catch {
    return 'failed';
  }
}

// On launch: close sessions left open when the app was swiped away, then send any
// finished ones that didn't get through.
export async function retryPending(app) {
  const all = await db.all('sessions');
  for (const x of all) {
    const closed = finalizeStale(x);
    if (closed) { await db.put('sessions', x.id, closed); Object.assign(x, closed); }
  }
  const s = app.settings || (await db.settings());
  if (!isConnected(s)) return;
  for (const session of all.filter(shouldLog)) await logSession(session, s);
}
