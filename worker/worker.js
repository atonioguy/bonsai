// bonsai-feeds — Cloudflare Worker
// Keeps one small KV entry per source. Every 5 minutes (cron) it refreshes the one source
// that's been waiting longest, so each run stays well inside the free plan's CPU limit
// (a large feed takes a few ms to parse). With ~22 sources, each refreshes about every 2 h.
// GET /feed stitches the stored entries together as text, without re-parsing them.
// Holds no personal keys: it only reads public feeds.

import { parseFeed, isLocked } from './parse.js';

const PER_SOURCE = 12;               // newest items kept per source
const FETCH_TIMEOUT = 15_000;
const REFRESH_GAP = 60_000;          // POST /refresh does at most one source a minute
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
          await refreshNext(env, sources);
          body = (await feedBody(env, sources)) || '{"sources":[]}';
        }
        return new Response(body, { headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const last = Number((await env.FEEDS.get('lastRefresh')) || 0);
        if (Date.now() - last < REFRESH_GAP) return json({ ok: true, skipped: true }, 200, cors);
        await env.FEEDS.put('lastRefresh', String(Date.now()));
        const done = await refreshNext(env, await loadSources(env));
        return json({ ok: true, refreshed: done }, 200, cors);
      }
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, name: 'bonsai-feeds' }, 200, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(loadSources(env).then((sources) => refreshNext(env, sources)));
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

// Refresh the source that has waited longest (never-fetched ones first).
async function refreshNext(env, sources) {
  if (!sources.length) return null;
  const listed = await env.FEEDS.list({ prefix: 'src:' });
  const seen = new Map(listed.keys.map((k) => [k.name.slice(4), (k.metadata && k.metadata.fetchedAt) || 0]));
  const next = sources.slice().sort((a, b) => (seen.get(a.id) || 0) - (seen.get(b.id) || 0))[0];
  await refreshOne(env, next);
  return next.id;
}

async function refreshOne(env, s) {
  const key = 'src:' + s.id;
  try {
    const all = await fetchOne(s);
    const open = s.hideLocked ? all.filter((it) => !isLocked(it)) : all;
    const kept = open.slice(0, PER_SOURCE);
    await env.FEEDS.put(key, JSON.stringify(kept), {
      metadata: { fetchedAt: Date.now(), ok: true, count: kept.length, hidden: all.length - open.length },
    });
  } catch (e) {
    // Keep the last good items; just record the failure.
    const old = await env.FEEDS.getWithMetadata(key);
    await env.FEEDS.put(key, old.value || '[]', {
      metadata: { ...(old.metadata || {}), fetchedAt: Date.now(), ok: false, error: String(e && e.message || e).slice(0, 160) },
    });
  }
}

async function fetchOne(source) {
  const r = await fetch(source.feed, {
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
  return items;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}
