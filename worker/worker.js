// bonsai-feeds — Cloudflare Worker
// Keeps one small KV entry per source. Every 5 minutes (cron) it refreshes the sources that are
// due (older than 2 h), a few at a time within a byte budget so each run stays inside the free
// plan's CPU limit (a large feed takes a few ms to parse).
// GET /feed stitches the stored entries together as text, without re-parsing them.
// Holds no personal keys: it only reads public feeds.

import { parseFeed, isLocked } from './parse.js';

const PER_SOURCE = 12;               // newest items kept per source
const FETCH_TIMEOUT = 15_000;
const REFRESH_GAP = 60_000;          // POST /refresh runs at most once a minute
const MAX_AGE = 2 * 3600_000;        // a source is due for a refresh after 2 hours
const RUN_BYTES = 300_000;           // feed text parsed per run: keeps CPU well inside the free limit
const RUN_MAX = 6;                   // and at most this many sources per run
// Video lengths aren't in YouTube's feeds. The app asks GET /length?v=ID for the videos it shows
// and keeps the answers on the phone, so this costs no KV writes. Reading stops once the length shows.
const LEN_BYTES = 2_000_000;
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// KV writes (the free plan allows 1,000 a day) come from saving sources. A source is checked every
// 2 h while it has news; each check that finds nothing new doubles its wait, up to 12 h. News sites
// stay at 2 h, quiet channels settle at 12 h: about 250 writes a day for ~50 sources, not 600.
const MAX_EVERY = 12 * 3600_000;
// Defaults, so the worker runs with only the FEEDS binding set. Override in the worker's variables.
const SOURCES_URL = 'https://atonioguy.github.io/bonsai/sources.json';
const ALLOW_ORIGIN = 'https://atonioguy.github.io';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/feed' && req.method === 'GET') {
        const sources = await loadSources(env);
        let body = await feedBody(env, sources);
        if (!body) { // first visit ever: fetch what fits now so the feed isn't empty
          await refreshDue(env, sources);
          body = (await feedBody(env, sources)) || '{"sources":[]}';
        }
        return new Response(body, { headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      // Refresh what's due now (for when the schedule isn't running). Writes nothing of its own:
      // skipped if anything was saved in the last minute.
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const meta = await storedMeta(env);
        const newest = Math.max(0, ...[...meta.values()].map((m) => m.fetchedAt || 0));
        if (Date.now() - newest < REFRESH_GAP) return json({ ok: true, skipped: true }, 200, cors);
        const done = await refreshDue(env, await loadSources(env), { meta });
        return json({ ok: true, refreshed: done }, 200, cors);
      }
      // Relay for Europe PMC (full text of open-access papers), in case the browser can't reach it
      // directly. Only its search and full-text XML paths are allowed, so this isn't an open proxy.
      if (url.pathname === '/epmc' && req.method === 'GET') {
        const path = url.searchParams.get('path') || '';
        if (!/^(search\?[^#]*|PMC\d{4,10}\/fullTextXML)$/.test(path)) return json({ error: 'not allowed' }, 400, cors);
        const r = await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/' + path, { cf: { cacheTtl: 86400 } });
        return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'text/plain' } });
      }
      // A video's length in seconds (0 if YouTube didn't say). ?debug=1 shows what each try found.
      if (url.pathname === '/length' && req.method === 'GET') {
        const v = url.searchParams.get('v') || '';
        if (!/^[\w-]{11}$/.test(v)) return json({ error: 'bad video id' }, 400, cors);
        const found = await videoLength(v);
        return json(url.searchParams.has('debug') ? found : { v, seconds: found.seconds }, 200, cors);
      }
      // How the feed is doing: sources loaded, and when the newest/oldest refresh happened.
      if (url.pathname === '/' || url.pathname === '/health') {
        const sources = await loadSources(env);
        const meta = await storedMeta(env);
        const m = sources.map((x) => meta.get(x.id) || {});
        const loaded = m.map((x) => x.fetchedAt || 0).filter(Boolean);
        return json({
          ok: true, name: 'bonsai-feeds', sources: sources.length, loaded: loaded.length,
          newest: loaded.length ? new Date(Math.max(...loaded)).toISOString() : null,
          overdue: m.filter((x) => Date.now() - (x.fetchedAt || 0) >= everyOf(x) + 30 * 60_000).length,
          failing: m.filter((x) => x.ok === false).length,
          writesPerDay: Math.round(m.reduce((n, x) => n + 86_400_000 / everyOf(x), 0)), // about, at the current waits
        }, 200, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(loadSources(env).then((sources) => refreshDue(env, sources)));
  },
};

async function loadSources(env) {
  const res = await fetch(env.SOURCES_URL || SOURCES_URL, { cf: { cacheTtl: 300 } });
  if (!res.ok) throw new Error('sources.json: HTTP ' + res.status);
  const cfg = await res.json();
  return (cfg.sources || []).filter((s) => s.feed);
}

// The stored entries stitched together as text (no JSON.parse of the big item lists).
async function feedBody(env, sources) {
  const entries = await Promise.all(sources.map((s) => env.FEEDS.getWithMetadata('src:' + s.id)));
  const parts = [];
  entries.forEach((e, i) => {
    if (!e.value) return;
    parts.push('{"id":' + JSON.stringify(sources[i].id) + ',"meta":' + JSON.stringify(e.metadata || {}) + ',"items":' + e.value + '}');
  });
  if (!parts.length) return '';
  return '{"updatedAt":' + JSON.stringify(new Date().toISOString()) + ',"sources":[' + parts.join(',') + ']}';
}

// Each source's saved state (fetchedAt, ok, every, top…) from one KV list.
async function storedMeta(env) {
  const listed = await env.FEEDS.list({ prefix: 'src:' });
  return new Map(listed.keys.map((k) => [k.name.slice(4), k.metadata || {}]));
}

const everyOf = (m) => Math.min(MAX_EVERY, Math.max(MAX_AGE, (m && m.every) || MAX_AGE));

// Refresh every source that's due (never fetched, or its wait is over), stalest first, until the
// run's byte budget is used. A new install fills in minutes; after that most runs do one or none.
async function refreshDue(env, sources, { meta = null } = {}) {
  if (!sources.length) return [];
  meta = meta || await storedMeta(env);
  const at = (x) => (meta.get(x.id) || {}).fetchedAt || 0;
  const now = Date.now();
  const due = sources.filter((x) => now - at(x) >= everyOf(meta.get(x.id))).sort((a, b) => at(a) - at(b));
  const done = [];
  let bytes = 0;
  for (const x of due.slice(0, RUN_MAX)) {
    try {
      bytes += await refreshOne(env, x, meta.get(x.id));
    } catch {
      break; // most likely the daily KV limit: stop here, the next run tries again
    }
    done.push(x.id);
    if (bytes >= RUN_BYTES) break;
  }
  return done;
}

// A video's length: from its watch page (read in pieces, stopping as soon as the length shows up),
// else from YouTube's player API. Each try leaves a note, for /length?debug=1.
export async function videoLength(id) {
  const out = { v: id, seconds: 0, tried: [] };
  for (const how of [fromWatchPage, fromPlayerApi]) {
    try {
      const r = await how(id);
      out.tried.push(r.note);
      if (r.seconds) { out.seconds = r.seconds; break; }
    } catch (e) {
      out.tried.push(how.name + ': ' + String(e && e.message || e).slice(0, 120));
    }
  }
  return out;
}

async function fromWatchPage(id) {
  const r = await fetch('https://www.youtube.com/watch?v=' + encodeURIComponent(id) + '&hl=en', {
    headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.8', cookie: 'CONSENT=YES+1; SOCS=CAI' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  const where = /consent\./.test(r.url || '') ? ' (consent page)' : '';
  if (!r.ok || !r.body) return { seconds: 0, note: 'watch page: HTTP ' + r.status + where };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let tail = '', bytes = 0, seconds = 0, bot = false;
  while (bytes < LEN_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    const text = tail + dec.decode(value, { stream: true });
    seconds = lengthIn(text);
    if (seconds) break;
    if (/not a bot/i.test(text)) bot = true;
    tail = text.slice(-120);
  }
  reader.cancel().catch(() => {});
  return { seconds, note: `watch page: ${Math.round(bytes / 1024)} KB, ${seconds ? 'found' : 'no length'}${bot ? ' (bot check)' : ''}${where}` };
}

async function fromPlayerApi(id) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': BROWSER_UA, cookie: 'CONSENT=YES+1; SOCS=CAI' },
    body: JSON.stringify({ videoId: id, context: { client: { clientName: 'WEB', clientVersion: '2.20250901.00.00', hl: 'en' } } }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  const text = r.ok ? await r.text() : '';
  const seconds = lengthIn(text);
  const status = (/"playabilityStatus":\{"status":"(\w+)"/.exec(text) || [])[1] || '';
  return { seconds, note: `player API: HTTP ${r.status}${status ? ', ' + status : ''}, ${seconds ? 'found' : 'no length'}` };
}

export function lengthIn(text) {
  const s = /"lengthSeconds":"(\d+)"/.exec(text);
  if (s) return Number(s[1]);
  const iso = /itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/.exec(text);
  if (iso && (iso[1] || iso[2] || iso[3])) return (Number(iso[1] || 0) * 3600) + (Number(iso[2] || 0) * 60) + Number(iso[3] || 0);
  const ms = /"approxDurationMs":"(\d+)"/.exec(text);
  return ms ? Math.round(Number(ms[1]) / 1000) : 0;
}

// `old` is the source's saved metadata. Nothing new since last time (same newest item) doubles its
// wait; something new brings it back to every 2 h. A failing source waits longer too.
async function refreshOne(env, s, old = {}) {
  const key = 'src:' + s.id;
  const longer = Math.min(MAX_EVERY, everyOf(old) * 2);
  let got;
  try {
    got = await fetchOne(s, env);
  } catch (e) {
    // Keep the last good items; just record the failure.
    const prev = await env.FEEDS.getWithMetadata(key);
    await env.FEEDS.put(key, prev.value || '[]', {
      metadata: { ...(prev.metadata || {}), fetchedAt: Date.now(), ok: false, every: longer, error: String(e && e.message || e).slice(0, 160) },
    });
    return 0;
  }
  const open = s.hideLocked ? got.items.filter((it) => !isLocked(it)) : got.items;
  const kept = open.slice(0, PER_SOURCE);
  const top = kept.length ? kept[0].id : '';
  const same = old.ok === true && old.top === top;
  await env.FEEDS.put(key, JSON.stringify(kept), {
    metadata: { fetchedAt: Date.now(), ok: true, count: kept.length, hidden: got.items.length - open.length, top, every: same ? longer : MAX_AGE },
  });
  return got.bytes;
}

// "youtube:@handle" → that channel's video feed. The channel id is looked up once and kept.
async function feedUrl(source, env) {
  const m = /^youtube:(.+)$/.exec(source.feed || '');
  if (!m) return source.feed;
  let id = m[1];
  if (!/^UC[\w-]{22}$/.test(id)) {
    const key = 'yt:' + id.toLowerCase();
    id = await env.FEEDS.get(key);
    if (!id) {
      const page = await fetch('https://www.youtube.com/' + m[1].replace(/^@?/, '@'), {
        headers: { 'accept-language': 'en-US,en;q=0.8', 'user-agent': 'Mozilla/5.0 (compatible; BonsaiFeeds/0.1)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!page.ok) throw new Error('YouTube channel page: HTTP ' + page.status);
      const html = await page.text();
      id = (/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)
        || /"externalId":"(UC[\w-]{22})"/.exec(html) || [])[1];
      if (!id) throw new Error('YouTube channel not found: ' + m[1]);
      await env.FEEDS.put(key, id);
    }
  }
  return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
}

async function fetchOne(source, env) {
  const r = await fetch(await feedUrl(source, env), {
    headers: {
      'user-agent': 'BonsaiFeeds/0.1 (personal feed reader; +https://github.com/atonioguy/bonsai)',
      'accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    cf: { cacheTtl: 900 },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const xml = await r.text();
  // Parse a few spare items so hidden (locked) posts can be replaced.
  const items = parseFeed(xml, source, source.hideLocked ? PER_SOURCE * 2 : PER_SOURCE);
  if (!items.length && !/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('not a feed');
  return { items, bytes: xml.length };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}
