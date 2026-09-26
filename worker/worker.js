// bonsai-feeds — Cloudflare Worker
// Keeps one small KV entry per source. Every 2 minutes (cron) it refreshes the sources that are
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
// Steady state is ~50 sources / 2 h ≈ 600 KV writes a day, under the free plan's 1,000.
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
        if (!body) { // first visit ever: fetch one source now so the feed isn't empty
          await refreshDue(env, sources, { force: true });
          body = (await feedBody(env, sources)) || '{"sources":[]}';
        }
        return new Response(body, { headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const last = Number((await env.FEEDS.get('lastRefresh')) || 0);
        if (Date.now() - last < REFRESH_GAP) return json({ ok: true, skipped: true }, 200, cors);
        await env.FEEDS.put('lastRefresh', String(Date.now()));
        const done = await refreshDue(env, await loadSources(env), { force: true });
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
      // How the feed is doing: sources loaded, and when the newest/oldest refresh happened.
      if (url.pathname === '/' || url.pathname === '/health') {
        const sources = await loadSources(env);
        const at = await refreshTimes(env);
        const times = sources.map((x) => at.get(x.id) || 0);
        const loaded = times.filter(Boolean);
        return json({
          ok: true, name: 'bonsai-feeds', sources: sources.length, loaded: loaded.length,
          newest: loaded.length ? new Date(Math.max(...loaded)).toISOString() : null,
          overdue: times.filter((t) => Date.now() - t >= MAX_AGE).length,
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

async function refreshTimes(env) {
  const listed = await env.FEEDS.list({ prefix: 'src:' });
  return new Map(listed.keys.map((k) => [k.name.slice(4), (k.metadata && k.metadata.fetchedAt) || 0]));
}

// Refresh every source that's due (never fetched, or older than MAX_AGE), stalest first, until the
// run's byte budget is used. A new install fills in minutes; after that most runs do one or none.
// force: if nothing is due, refresh the stalest one anyway (manual refresh, first visit).
async function refreshDue(env, sources, { force = false } = {}) {
  if (!sources.length) return [];
  const at = await refreshTimes(env);
  const now = Date.now();
  const order = sources.slice().sort((a, b) => (at.get(a.id) || 0) - (at.get(b.id) || 0));
  let due = order.filter((x) => now - (at.get(x.id) || 0) >= MAX_AGE);
  if (!due.length && force) due = order.slice(0, 1);
  const done = [];
  let bytes = 0;
  for (const x of due.slice(0, RUN_MAX)) {
    bytes += await refreshOne(env, x);
    done.push(x.id);
    if (bytes >= RUN_BYTES) break;
  }
  return done;
}

async function refreshOne(env, s) {
  const key = 'src:' + s.id;
  try {
    const { items: all, bytes } = await fetchOne(s, env);
    const open = s.hideLocked ? all.filter((it) => !isLocked(it)) : all;
    const kept = open.slice(0, PER_SOURCE);
    await env.FEEDS.put(key, JSON.stringify(kept), {
      metadata: { fetchedAt: Date.now(), ok: true, count: kept.length, hidden: all.length - open.length },
    });
    return bytes;
  } catch (e) {
    // Keep the last good items; just record the failure.
    const old = await env.FEEDS.getWithMetadata(key);
    await env.FEEDS.put(key, old.value || '[]', {
      metadata: { ...(old.metadata || {}), fetchedAt: Date.now(), ok: false, error: String(e && e.message || e).slice(0, 160) },
    });
    return 0;
  }
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
