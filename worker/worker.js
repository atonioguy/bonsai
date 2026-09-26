// bonsai-feeds — Cloudflare Worker
// Every 2 hours (cron) it reads sources.json from the live site, fetches each feed,
// turns them into cards, and stores the result in KV. The app reads GET /feed.
// Holds no personal keys: it only reads public feeds.

import { parseFeed } from './parse.js';

const PER_SOURCE = 12;          // newest items kept per source
const FETCH_TIMEOUT = 15_000;
const MIN_REFRESH_GAP = 10 * 60_000; // POST /refresh is ignored if the last build is newer than this

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/feed' && req.method === 'GET') {
        let body = await env.FEEDS.get('feed');
        if (!body) body = JSON.stringify(await build(env)); // first run, before the cron has fired
        return new Response(body, { headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const last = Number((await env.FEEDS.get('builtAt')) || 0);
        if (Date.now() - last < MIN_REFRESH_GAP) return json({ ok: true, skipped: true, builtAt: new Date(last).toISOString() }, 200, cors);
        const feed = await build(env);
        return json({ ok: true, builtAt: feed.updatedAt, count: feed.items.length }, 200, cors);
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
    ctx.waitUntil(build(env));
  },
};

async function build(env) {
  const res = await fetch(env.SOURCES_URL, { cf: { cacheTtl: 300 } });
  if (!res.ok) throw new Error('sources.json: HTTP ' + res.status);
  const cfg = await res.json();
  const sources = (cfg.sources || []).filter((s) => s.feed);

  const results = await Promise.allSettled(sources.map((s) => fetchOne(s)));
  const items = [];
  const status = [];
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value.slice(0, PER_SOURCE));
      status.push({ id: s.id, ok: true, count: Math.min(r.value.length, PER_SOURCE) });
    } else {
      status.push({ id: s.id, ok: false, error: String(r.reason && r.reason.message || r.reason).slice(0, 200) });
    }
  });

  const feed = { updatedAt: new Date().toISOString(), items, status };
  await env.FEEDS.put('feed', JSON.stringify(feed));
  await env.FEEDS.put('builtAt', String(Date.now()));
  return feed;
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
  const items = parseFeed(xml, source);
  if (!items.length) throw new Error('no items (not a feed?)');
  return items;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}
