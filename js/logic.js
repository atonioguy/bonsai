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

// ---------- reading list ----------
// Queued articles come back into the feed on a widening schedule until you remove them
// (you're asked at the end of the article).
export const LIST_DAYS = [1, 3, 7, 14, 30];

export function newListEntry(now = Date.now()) {
  return { addedAt: now, stage: 0, dueAt: now + LIST_DAYS[0] * DAY };
}

export function dueListed(posts, now = Date.now(), max = 2) {
  return posts
    .filter((p) => p.list && p.list.dueAt <= now)
    .sort((a, b) => a.list.dueAt - b.list.dueAt)
    .slice(0, max);
}

export function afterListShown(list, now = Date.now()) {
  const stage = Math.min(list.stage + 1, LIST_DAYS.length - 1);
  return { ...list, stage, dueAt: now + LIST_DAYS[stage] * DAY };
}

// ---------- new (not yet seen) items ----------
// Seen under its own id or, for a merged post, under the other feed's id.
export const seenOf = (seen, i) => Boolean(seen && (seen[i.id] || (i.dupIds || []).some((d) => seen[d])));

export function newCounts(items, seen, muted = new Set()) {
  const byTopic = {};
  let all = 0;
  for (const i of items) {
    if (isMuted(i, muted) || seenOf(seen, i)) continue;
    all++;
    for (const t of topicsOf(i)) byTopic[t] = (byTopic[t] || 0) + 1;
  }
  return { all, byTopic };
}

// New items first, then the ones already seen (the feed puts an "Earlier" line between).
export function splitNew(entries, seen) {
  const fresh = [], older = [];
  for (const e of entries) (seenOf(seen, e) ? older : fresh).push(e);
  return { fresh, older };
}

// ---------- keeping the feed short and varied ----------
// Like other feeds, old posts drop away: "Earlier" keeps only posts seen in the last few days (at most
// a screenful or two), and anything that arrived over a month ago leaves the feed (saved posts stay in
// Collections). No one source takes over a refresh: its extra new posts wait for the next one.
export const FEED_SHAPE = { perSource: 3, earlierDays: 3, earlierMax: 20, maxAgeDays: 30 };
const DAY_MS = 86_400_000;

export const firstSeen = (seen, i) => Math.min(...[i.id, ...(i.dupIds || [])].map((d) => (seen && seen[d]) || Infinity));

/** Items that arrived too long ago to be in the feed at all. */
export function tooOld(i, arrived, now = Date.now(), shape = FEED_SHAPE) {
  const at = arrived && arrived[i.id];
  return Boolean(at) && now - at > shape.maxAgeDays * DAY_MS;
}

/** At most `n` per source, in order; returns [kept, leftOver]. */
export function capPerSource(items, n = FEED_SHAPE.perSource) {
  const count = {}, kept = [], left = [];
  for (const i of items) {
    const k = i.sourceId;
    if ((count[k] || 0) < n) { count[k] = (count[k] || 0) + 1; kept.push(i); } else left.push(i);
  }
  return [kept, left];
}

/** Split a mixed pool into what a fresh feed shows: capped new posts, then a short "Earlier". */
export function shapeFeed(entries, seen, { now = Date.now(), shape = FEED_SHAPE } = {}) {
  const { fresh, older } = splitNew(entries, seen);
  const [kept] = capPerSource(fresh, shape.perSource);
  const recent = older.filter((i) => now - firstSeen(seen, i) <= shape.earlierDays * DAY_MS).slice(0, shape.earlierMax);
  return { fresh: kept, older: recent };
}

// Remember when each item first reached this device; forget ones long gone from the feed.
export function stampArrivals(arrived = {}, items = [], now = Date.now()) {
  const next = { ...arrived };
  let changed = false;
  const here = new Set();
  for (const i of items) {
    here.add(i.id);
    if (!next[i.id]) { next[i.id] = now; changed = true; }
  }
  for (const [id, t] of Object.entries(next)) {
    if (!here.has(id) && now - t > 60 * DAY_MS) { delete next[id]; changed = true; }
  }
  return { arrived: next, changed };
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
// The same article from two feeds (e.g. two PubMed searches) becomes one post.
export function normalizeFeed(data) {
  if (!data || !Array.isArray(data.sources)) return { updatedAt: data?.updatedAt, items: mergeDuplicates(data?.items || []), status: data?.status || [], merged: true };
  return {
    updatedAt: data.updatedAt,
    items: mergeDuplicates(data.sources.flatMap((s) => s.items || [])),
    status: data.sources.map((s) => ({ id: s.id, ...(s.meta || {}) })),
    merged: true,
  };
}

// A merged post lists every source and topic it came from; a single one has just its own.
export const sourcesOf = (i) => i.sourceIds || [i.sourceId];
export const topicsOf = (i) => i.topics || [i.topic];
export const hasTopic = (i, topic) => topicsOf(i).includes(topic);
export const isMuted = (i, muted) => sourcesOf(i).every((id) => muted.has(id));

// Topics come from the current sources.json, not the copy the feed server stored, so moving a
// source to another topic takes effect at once. Unknown sources keep what they had.
export function retopic(items, sources = []) {
  const topicOf = new Map(sources.map((x) => [x.id, x.topic]));
  return items.map((i) => {
    const topics = [...new Set(sourcesOf(i).map((id) => topicOf.get(id)).filter(Boolean))];
    if (!topics.length || (topics.length === 1 && !i.topics && topics[0] === i.topic)) return i;
    return i.topics || topics.length > 1 ? { ...i, topic: topics[0], topics } : { ...i, topic: topics[0] };
  });
}

// What makes two feed items the same article: the PubMed id or DOI in its link, the YouTube video,
// else the link without tracking parameters. Only the link counts (a DOI cited in the text doesn't).
export function dupKey(item) {
  if (item.videoId) return 'yt:' + item.videoId;
  const url = item.url || '';
  const pmid = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})/.exec(url);
  if (pmid) return 'pmid:' + pmid[1];
  const doi = /\b(10\.\d{4,9}\/[^\s?#]+)/.exec(url);
  if (doi) return 'doi:' + decodeURIComponent(doi[1]).toLowerCase().replace(/\/(full|abstract|pdf|epdf)$/, '');
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_(cid|eid)$|ref$)/.test(k)) u.searchParams.delete(k);
    return 'url:' + u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + (u.search || '');
  } catch {
    return 'id:' + item.id;
  }
}

// Duplicates collapse into the one with the smallest id (stable while both feeds carry it). The
// others' ids stay on it as dupIds, so "seen" and "opened" carry over if one feed drops it.
export function mergeDuplicates(items) {
  const groups = new Map();
  for (const i of items) {
    const k = dupKey(i);
    const g = groups.get(k);
    if (g) g.push(i); else groups.set(k, [i]);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    g.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const best = g.reduce((a, b) => ((b.html || '').length > (a.html || '').length ? b : a));
    const uniq = (xs) => [...new Set(xs)];
    out.push({
      ...g[0],
      html: best.html || g[0].html,
      excerpt: g[0].excerpt || best.excerpt,
      sourceIds: uniq(g.flatMap(sourcesOf)),
      topics: uniq(g.flatMap(topicsOf)),
      dupIds: uniq(g.slice(1).map((i) => i.id)),
    });
  }
  return out;
}

// ---------- tags ----------
// A post's tags: what it's about (a source's own `tags` in sources.json, else its topic's name),
// then what it is (Article, Video, Short, Podcast).
export function mediaTag(item) {
  if (item.videoId) return item.short ? 'Short' : 'Video';
  if (item.kind === 'audio' || item.audioUrl) return 'Podcast';
  return 'Article';
}

export function postTags(item, config = {}) {
  const sources = config.sources || [], topics = config.topics || [];
  const out = [];
  for (const id of sourcesOf(item)) {
    const src = sources.find((x) => x.id === id);
    const topicName = (t) => topics.find((x) => x.id === t)?.name;
    const labels = src?.tags?.length ? src.tags : [topicName(src?.topic || item.topic)];
    for (const l of labels) if (l && !out.includes(l)) out.push(l);
  }
  if (!sourcesOf(item).some((id) => sources.some((x) => x.id === id))) {
    for (const t of topicsOf(item)) { // a source no longer in sources.json: fall back to the topic
      const n = topics.find((x) => x.id === t)?.name;
      if (n && !out.includes(n)) out.push(n);
    }
  }
  out.push(mediaTag(item));
  return out;
}

// 754 → "12:34", 3723 → "1:02:03"
export function formatLength(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/**
 * Newest first, but never two in a row from the same source when it can be avoided.
 * @param {Array} items  feed items
 * @param {{topic?:string, muted?:Set<string>, limit?:number}} opts
 */
export function mixFeed(items, { topic = 'all', muted = new Set(), limit = 80, arrived = null } = {}) {
  // Newest to arrive in Bonsai first (arrived: id → time first fetched), then newest published.
  const at = (i) => (arrived && arrived[i.id]) || 0;
  const pool = items
    .filter((i) => (topic === 'all' || hasTopic(i, topic)) && !isMuted(i, muted))
    .sort((a, b) => at(b) - at(a) || (b.published || '').localeCompare(a.published || ''));
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
export function composeFeed(entries, { book = null, throwbacks = [], listed = [], every = 6 } = {}) {
  const out = entries.map((data) => ({ type: 'entry', data }));
  // Your own things (reading list first, then throwbacks) take turns in the gaps.
  const extras = [];
  for (let i = 0; i < Math.max(listed.length, throwbacks.length); i++) {
    if (listed[i]) extras.push({ type: 'listed', data: listed[i] });
    if (throwbacks[i]) extras.push({ type: 'throwback', data: throwbacks[i] });
  }
  let t = 0;
  for (let i = every; i <= out.length && t < extras.length; i += every + 1) out.splice(i, 0, extras[t++]);
  while (t < extras.length) out.push(extras[t++]); // a short feed still shows them, at the end
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

// ---------- your bonsai (growth) ----------
// It grows with what you do in the app. Points: 1 per minute read (books), 10 per finished
// timed session, 1 per article opened, 5 per article read to the end, 3 per saved quote,
// 2 per note, 1 per reaction. Each topic's branch grows with that topic's share.
export const STAGES = [
  [0, 'Seed'], [25, 'Sprout'], [100, 'Sapling'], [250, 'Young tree'],
  [600, 'Shaped'], [1200, 'Mature'], [2500, 'Old tree'],
];

export function growth({ sessions = [], posts = [], quotes = [], bookTopics = {} } = {}) {
  let points = 0;
  const byTopic = {};
  const add = (n, topic) => { points += n; if (topic) byTopic[topic] = (byTopic[topic] || 0) + n; };
  for (const s of sessions) {
    if (!s.end) continue;
    add(Math.floor((s.activeSec || 0) / 60) + (s.mode !== 'free' && s.complete ? 10 : 0), bookTopics[s.bookId]);
  }
  for (const p of posts) {
    const t = p.item && p.item.topic;
    if (p.openedAt) add(1, t);
    if (p.scroll >= 0.9) add(5, t);
    add(2 * (p.notes ? p.notes.length : 0) + (p.reaction ? 1 : 0), t);
  }
  for (const q of quotes) add(3, q.topic);

  let stage = 0;
  while (stage < STAGES.length - 1 && points >= STAGES[stage + 1][0]) stage++;
  const from = STAGES[stage][0];
  const to = stage < STAGES.length - 1 ? STAGES[stage + 1][0] : null;
  const progress = to ? (points - from) / (to - from) : 1;
  return {
    points, byTopic, stage, name: STAGES[stage][1],
    next: to ? { at: to, name: STAGES[stage + 1][1] } : null,
    progress,
    g: Math.min(1, (stage + progress) / (STAGES.length - 1)), // 0…1 overall size for the drawing
  };
}

export function totals({ sessions = [], posts = [] } = {}, from = 0) {
  const s = sessions.filter((x) => x.end && x.end >= from);
  return {
    minutes: Math.round(s.reduce((n, x) => n + (x.activeSec || 0), 0) / 60),
    sessions: s.filter((x) => x.complete).length,
    finished: posts.filter((p) => p.scroll >= 0.9 && (p.openedAt || 0) >= from).length,
  };
}

// ---------- article identifiers (for full text) ----------
// PubMed links carry the PMID; journal links usually carry the DOI.
export function articleIds(item) {
  const text = [item.url, item.id && String(item.id).startsWith('pmid') ? item.id : '', item.html, item.excerpt].filter(Boolean).join(' ');
  const pmid = (/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})/.exec(text) || /\bPMID:?\s*(\d{5,9})\b/i.exec(text) || [])[1] || null;
  const pmcid = (/\b(PMC\d{5,9})\b/.exec(text) || [])[1] || null;
  let doi = (/\b(10\.\d{4,9}\/[^\s"'<>&?#]+)/.exec(text) || [])[1] || null;
  if (doi) doi = decodeURIComponent(doi).replace(/[.,;:)\]]+$/, '').replace(/\/(full|abstract|pdf|epdf)$/i, '');
  return pmid || pmcid || doi ? { pmid, pmcid, doi } : null;
}

export function libkeyUrl(libraryId, ids) {
  if (!libraryId || !ids) return '';
  if (ids.doi) return `https://libkey.io/libraries/${encodeURIComponent(libraryId)}/${ids.doi}`;
  if (ids.pmid) return `https://libkey.io/libraries/${encodeURIComponent(libraryId)}/pmid/${ids.pmid}`;
  return '';
}

// ---------- daily news brief ----------
// Five stories a day, one per source where possible, always including one good-news story.
export const BRIEF_SIZE = 5;

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function pickBrief(items, { topic = 'news', positive = new Set(), now = Date.now(), size = BRIEF_SIZE } = {}) {
  const news = items.filter((i) => hasTopic(i, topic));
  const within = (hours) => news.filter((i) => i.published && now - Date.parse(i.published) < hours * 3600e3);
  let pool = within(36);
  if (pool.length < size) pool = within(96);
  if (!pool.length) pool = news;
  pool = pool.slice().sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  const good = pool.find((i) => positive.has(i.sourceId));
  const room = size - (good ? 1 : 0);
  const picked = [], used = new Set();
  for (const i of pool) { // newest from each hard-news source first
    if (picked.length >= room) break;
    if (positive.has(i.sourceId) || used.has(i.sourceId)) continue;
    picked.push(i); used.add(i.sourceId);
  }
  for (const i of pool) { // then fill up if there weren't enough sources
    if (picked.length >= room) break;
    if (!positive.has(i.sourceId) && !picked.includes(i)) picked.push(i);
  }
  if (good) picked.push(good);
  return picked;
}

// ---------- feed server health (from /feed status) ----------
// Its schedule refreshes whatever is due, so nothing newer than ~20 min while sources are still
// missing means the schedule isn't running. Once loaded, news sources are saved every 2 h, so
// nothing saved for 3 h (as of when the feed was fetched) means the server can't save: its schedule
// stopped, or Cloudflare's free daily limit is used up.
export const QUIET_AFTER = 3 * 3600_000;
export function serverHealth(status = [], expected = 0, now = Date.now()) {
  const times = status.map((x) => x.fetchedAt || 0).filter(Boolean);
  const newest = times.length ? Math.max(...times) : 0;
  const loaded = status.length;
  const stalled = loaded < expected && (!newest || now - newest > 20 * 60_000);
  const quiet = !stalled && Boolean(newest) && now - newest > QUIET_AFTER;
  return { loaded, expected, newest, stalled, quiet };
}

// Cloudflare's daily limits reset at midnight UTC.
export function limitResetAt(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
