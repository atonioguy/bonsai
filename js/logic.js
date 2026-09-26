// Pure logic (no DOM) — imported by the app and by the Node tests.

const DAY = 86_400_000;

// ---------- throwbacks ----------
// A saved quote comes back after these gaps. Each time it's shown, it moves one step out.
export const THROWBACK_DAYS = [3, 10, 30, 90, 180];

export function newSaved(fields, now = Date.now()) {
  return {
    id: 's' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: now,
    stage: 0,
    dueAt: now + THROWBACK_DAYS[0] * DAY,
    shownAt: null,
    ...fields,
  };
}

export function dueThrowbacks(saved, now = Date.now(), max = 3) {
  return saved
    .filter((s) => s.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, max);
}

export function afterShown(s, now = Date.now()) {
  const stage = Math.min(s.stage + 1, THROWBACK_DAYS.length - 1);
  return { ...s, stage, shownAt: now, dueAt: now + THROWBACK_DAYS[stage] * DAY };
}

// ---------- reading sessions ----------
// Timed sessions are a challenge: only a finished one counts. A free read counts whatever
// was read, and goes to Side Quest as a stopwatch record (Side Quest: 1 tomato per 25 min,
// remainder carried; it ignores records under 5 min, so shorter free reads stay local).
export const SESSION_CHOICES = [5, 15, 25];
export const SQ_MIN_SEC = 5 * 60;
export const STALE_OPEN = 3 * 60_000;   // an open session untouched this long was abandoned (app closed)

export function shouldLog(s) {
  return Boolean(s.complete) && !s.synced && (s.mode !== 'free' || s.activeSec >= SQ_MIN_SEC);
}

// Close a session left open when the app was swiped away. Returns the closed copy, or null.
export function finalizeStale(s, now = Date.now()) {
  const last = s.lastActive || s.start;
  if (!s.open || now - last < STALE_OPEN) return null;
  return { ...s, open: false, end: last, complete: s.mode === 'free' ? s.activeSec >= 60 : Boolean(s.complete) };
}

// ---------- feed mix ----------
// The worker answers { sources: [{ id, meta, items }] }; the app works with flat items + status.
export function normalizeFeed(data) {
  if (!data || !Array.isArray(data.sources)) return { updatedAt: data?.updatedAt, items: data?.items || [], status: data?.status || [] };
  return {
    updatedAt: data.updatedAt,
    items: data.sources.flatMap((s) => s.items || []),
    status: data.sources.map((s) => ({ id: s.id, ...(s.meta || {}) })),
  };
}

/**
 * Newest first, but never two in a row from the same source when it can be avoided.
 * @param {Array} items  feed items
 * @param {{topic?:string, muted?:Set<string>, limit?:number}} opts
 */
export function mixFeed(items, { topic = 'all', muted = new Set(), limit = 80 } = {}) {
  const pool = items
    .filter((i) => (topic === 'all' || i.topic === topic) && !muted.has(i.sourceId))
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  const out = [];
  while (pool.length && out.length < limit) {
    const prev = out.length ? out[out.length - 1].sourceId : null;
    let at = pool.findIndex((i) => i.sourceId !== prev);
    if (at < 0) at = 0;
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}

/**
 * Interleave the extra cards: the book card second, a throwback after every `every` entries.
 * Returns [{type:'entry'|'book'|'throwback', data}]
 */
export function composeFeed(entries, { book = null, throwbacks = [], every = 6 } = {}) {
  const out = entries.map((data) => ({ type: 'entry', data }));
  let t = 0;
  for (let i = every; i <= out.length && t < throwbacks.length; i += every + 1) {
    out.splice(i, 0, { type: 'throwback', data: throwbacks[t++] });
  }
  // a short feed still shows due throwbacks, at the end
  while (t < throwbacks.length) out.push({ type: 'throwback', data: throwbacks[t++] });
  if (book) out.splice(Math.min(1, out.length), 0, { type: 'book', data: book });
  return out;
}

// ---------- formatting ----------
export function relTime(iso, now = Date.now()) {
  if (!iso) return '';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24);
  if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
  const w = Math.round(d / 7);
  if (d < 30) return w + (w === 1 ? ' week ago' : ' weeks ago');
  const mo = Math.round(d / 30);
  if (d < 365) return mo + (mo === 1 ? ' month ago' : ' months ago');
  const y = Math.round(d / 365);
  return y + (y === 1 ? ' year ago' : ' years ago');
}

export function minutesLabel(sec) {
  const m = Math.ceil(sec / 60);
  return m + ' min';
}

// Monday 00:00 local of the week containing `now`.
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * DAY;
}

export function weekSummary({ sessions = [], saved = [] }, now = Date.now()) {
  const from = weekStart(now);
  const s = sessions.filter((x) => x.end >= from);
  return {
    minutes: Math.round(s.reduce((n, x) => n + (x.activeSec || 0), 0) / 60),
    sessions: s.filter((x) => x.complete).length,
    saved: saved.filter((x) => x.savedAt >= from).length,
  };
}

// Foliage scale for a topic on the Saved tree: 0 saved → 0.55, 20+ → 1.
export function foliageScale(count) {
  return 0.55 + 0.45 * Math.min(1, count / 20);
}
