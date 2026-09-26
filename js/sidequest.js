// Side Quest bridge: a finished reading session becomes a TickTick focus record through
// Side Quest's own worker (aquamarine-data, POST /focus). Side Quest counts it like a pomodoro.
import * as db from './db.js';

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
        type: 0,
        taskId: null,
        note: 'Bonsai · ' + session.bookTitle,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await db.put('sessions', session.id, { ...session, synced: true });
    return 'logged';
  } catch {
    return 'failed';
  }
}

// On launch, send any finished sessions that didn't get through.
export async function retryPending(app) {
  const s = app.settings || (await db.settings());
  if (!isConnected(s)) return;
  const pending = (await db.all('sessions')).filter((x) => x.complete && !x.synced);
  for (const session of pending) await logSession(session, s);
}
