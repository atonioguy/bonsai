import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THROWBACK_DAYS, newSaved, dueThrowbacks, afterShown,
  mixFeed, composeFeed, relTime, weekStart, weekSummary, foliageScale,
  shouldLog, finalizeStale, SQ_MIN_SEC, STALE_OPEN,
} from '../js/logic.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 26, 12);

test('throwbacks: first due after 3 days, then each step further out, capped', () => {
  let s = newSaved({ text: 'q' }, T0);
  assert.equal(s.dueAt, T0 + 3 * DAY);
  assert.deepEqual(dueThrowbacks([s], T0 + 2 * DAY), []);
  assert.equal(dueThrowbacks([s], T0 + 3 * DAY).length, 1);
  let now = T0;
  for (let i = 1; i < THROWBACK_DAYS.length + 2; i++) {
    now += 400 * DAY;
    s = afterShown(s, now);
    const stage = Math.min(i, THROWBACK_DAYS.length - 1);
    assert.equal(s.stage, stage);
    assert.equal(s.dueAt, now + THROWBACK_DAYS[stage] * DAY);
  }
});

test('throwbacks: oldest due first, capped at max', () => {
  const list = [5, 1, 3, 2].map((d) => ({ ...newSaved({ text: String(d) }, T0), dueAt: T0 + d }));
  assert.deepEqual(dueThrowbacks(list, T0 + 10, 3).map((s) => s.text), ['1', '2', '3']);
});

const item = (id, sourceId, h, topic = 'mind') => ({ id, sourceId, topic, published: new Date(T0 - h * 3600e3).toISOString() });

test('mixFeed: newest first, avoids back-to-back sources, filters', () => {
  const items = [item('a1', 'a', 1), item('a2', 'a', 2), item('a3', 'a', 3), item('b1', 'b', 4, 'tao'), item('c1', 'c', 5)];
  assert.deepEqual(mixFeed(items).map((i) => i.id), ['a1', 'b1', 'a2', 'c1', 'a3']);
  assert.deepEqual(mixFeed(items, { topic: 'tao' }).map((i) => i.id), ['b1']);
  assert.deepEqual(mixFeed(items, { muted: new Set(['a']) }).map((i) => i.id), ['b1', 'c1']);
  assert.equal(mixFeed(items, { limit: 2 }).length, 2);
});

test('composeFeed: book second, throwbacks spaced out, leftovers at end', () => {
  const entries = Array.from({ length: 14 }, (_, i) => ({ id: 'e' + i }));
  const out = composeFeed(entries, { book: { id: 'b' }, throwbacks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }], every: 6 });
  const types = out.map((x) => x.type);
  assert.equal(types[1], 'book');
  assert.equal(types.filter((t) => t === 'throwback').length, 3);
  assert.equal(types.filter((t) => t === 'entry').length, 14);
  assert.equal(out[7].type, 'throwback');
  assert.deepEqual(composeFeed([], { book: { id: 'b' } }).map((x) => x.type), ['book']);
});

test('relTime', () => {
  assert.equal(relTime(T0 - 30e3, T0), 'now');
  assert.equal(relTime(T0 - 5 * 60e3, T0), '5 min ago');
  assert.equal(relTime(T0 - 3 * 3600e3, T0), '3 h ago');
  assert.equal(relTime(T0 - 1 * DAY, T0), '1 day ago');
  assert.equal(relTime(T0 - 21 * DAY, T0), '3 weeks ago');
  assert.equal(relTime(T0 - 400 * DAY, T0), '1 year ago');
  assert.equal(relTime(null, T0), '');
});

test('weekSummary counts only this week', () => {
  const ws = weekStart(T0);
  const sessions = [
    { end: ws + 1000, activeSec: 900, complete: true },
    { end: ws + 2000, activeSec: 300, complete: false },
    { end: ws - 1000, activeSec: 900, complete: true },
  ];
  const saved = [{ savedAt: ws + 5 }, { savedAt: ws - 5 }];
  assert.deepEqual(weekSummary({ sessions, saved }, T0), { minutes: 20, sessions: 1, saved: 1 });
});

test('foliageScale bounds', () => {
  assert.equal(foliageScale(0), 0.55);
  assert.equal(foliageScale(100), 1);
});

test('shouldLog: finished timed sessions; free reads of 5 min or more; never twice', () => {
  assert.equal(shouldLog({ mode: 'timed', complete: true, activeSec: 300 }), true);
  assert.equal(shouldLog({ mode: 'timed', complete: false, activeSec: 800 }), false);
  assert.equal(shouldLog({ mode: 'free', complete: true, activeSec: SQ_MIN_SEC }), true);
  assert.equal(shouldLog({ mode: 'free', complete: true, activeSec: SQ_MIN_SEC - 1 }), false);
  assert.equal(shouldLog({ mode: 'free', complete: true, activeSec: 900, synced: true }), false);
});

test('finalizeStale closes abandoned sessions: free counts, unfinished timed does not', () => {
  const base = { open: true, start: T0, lastActive: T0 + 600e3, activeSec: 600 };
  assert.equal(finalizeStale({ ...base, mode: 'free' }, T0 + 600e3 + STALE_OPEN - 1), null);
  const f = finalizeStale({ ...base, mode: 'free' }, T0 + 600e3 + STALE_OPEN);
  assert.deepEqual([f.open, f.complete, f.end], [false, true, T0 + 600e3]);
  const t = finalizeStale({ ...base, mode: 'timed', minutes: 15 }, T0 + 3600e3);
  assert.deepEqual([t.open, t.complete], [false, false]);
  assert.equal(finalizeStale({ ...base, open: false, mode: 'free' }, T0 + 3600e3), null);
});

import { LIST_DAYS, newListEntry, dueListed, afterListShown, newCounts, splitNew } from '../js/logic.js';

test('reading list: due after a day, then further out each time it shows', () => {
  const l = newListEntry(T0);
  assert.equal(l.dueAt, T0 + LIST_DAYS[0] * DAY);
  const posts = [{ id: 'a', list: l }, { id: 'b', list: null }, { id: 'c', list: { ...l, dueAt: T0 - 5 } }];
  assert.deepEqual(dueListed(posts, T0 + DAY).map((p) => p.id), ['c', 'a']);
  assert.deepEqual(dueListed(posts, T0).map((p) => p.id), ['c']);
  let x = l;
  for (let i = 0; i < 8; i++) x = afterListShown(x, T0);
  assert.equal(x.stage, LIST_DAYS.length - 1);
  assert.equal(x.dueAt, T0 + LIST_DAYS.at(-1) * DAY);
});

test('newCounts and splitNew', () => {
  const items = [{ id: '1', topic: 'mind', sourceId: 'a' }, { id: '2', topic: 'mind', sourceId: 'b' }, { id: '3', topic: 'tao', sourceId: 'a' }, { id: '4', topic: 'tao', sourceId: 'm' }];
  const seen = { 1: 1 };
  assert.deepEqual(newCounts(items, seen, new Set(['m'])), { all: 2, byTopic: { mind: 1, tao: 1 } });
  const { fresh, older } = splitNew(items, seen);
  assert.deepEqual([fresh.map((i) => i.id), older.map((i) => i.id)], [['2', '3', '4'], ['1']]);
});

test('composeFeed: reading-list items and throwbacks take turns', () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i }));
  const out = composeFeed(entries, { listed: [{ id: 'l1' }], throwbacks: [{ id: 't1' }, { id: 't2' }] });
  assert.deepEqual(out.filter((x) => x.type !== 'entry').map((x) => x.data.id), ['l1', 't1', 't2']);
});

import { growth, STAGES } from '../js/logic.js';

test('growth: points from reading, sessions, articles, quotes; stages and topics', () => {
  const empty = growth();
  assert.deepEqual([empty.points, empty.stage, empty.name], [0, 0, 'Seed']);
  const g = growth({
    sessions: [{ end: 1, activeSec: 1200, mode: 'timed', complete: true, bookId: 'b' }, { end: 1, activeSec: 600, mode: 'free', complete: true, bookId: 'x' }, { activeSec: 999 }],
    posts: [{ openedAt: 1, scroll: 1, item: { topic: 'mind' }, notes: [{}], reaction: 'loved' }, { openedAt: 1, scroll: 0.2, item: { topic: 'tao' }, notes: [] }],
    quotes: [{ topic: 'mind' }],
    bookTopics: { b: 'tao' },
  });
  // 20+10 (tao) + 10 (no topic) + 1+5+2+1 (mind) + 1 (tao) + 3 (mind)
  assert.equal(g.points, 53);
  assert.deepEqual(g.byTopic, { tao: 31, mind: 12 });
  assert.equal(g.name, 'Sprout');
  assert.equal(g.next.name, 'Sapling');
  assert.ok(g.progress > 0.37 && g.progress < 0.38);
  assert.equal(growth({ quotes: Array(1000).fill({}) }).name, STAGES.at(-1)[1]);
});

import { articleIds, libkeyUrl } from '../js/logic.js';

test('articleIds: PMID from PubMed links, DOI from journal links, PMCID in text', () => {
  assert.deepEqual(articleIds({ url: 'https://pubmed.ncbi.nlm.nih.gov/39797602/?utm_source=x' }), { pmid: '39797602', pmcid: null, doi: null });
  assert.equal(articleIds({ url: 'https://www.tandfonline.com/doi/full/10.1080/26895269.2025.1234567?af=R' }).doi, '10.1080/26895269.2025.1234567');
  assert.equal(articleIds({ url: 'https://link.springer.com/article/10.1186/s40479-025-00280-1' }).doi, '10.1186/s40479-025-00280-1');
  assert.equal(articleIds({ url: 'https://x.org', html: '<p>doi: 10.1016/j.jad.2025.01.002.</p><p>PMC11223344</p>' }).pmcid, 'PMC11223344');
  assert.equal(articleIds({ url: 'https://example.org/essay' }), null);
  assert.equal(libkeyUrl('782', { pmid: '41000322' }), 'https://libkey.io/libraries/782/pmid/41000322');
  assert.equal(libkeyUrl('782', { doi: '10.1/abc', pmid: '1' }), 'https://libkey.io/libraries/782/10.1/abc');
  assert.equal(libkeyUrl('', { pmid: '1' }), '');
});

import { pickBrief, dayKey } from '../js/logic.js';

test('pickBrief: one per source, newest first, always one good-news story', () => {
  const at = (h) => new Date(T0 - h * 3600e3).toISOString();
  const items = [
    { id: 'a1', sourceId: 'a', topic: 'news', published: at(1) }, { id: 'a2', sourceId: 'a', topic: 'news', published: at(2) },
    { id: 'b1', sourceId: 'b', topic: 'news', published: at(3) }, { id: 'c1', sourceId: 'c', topic: 'news', published: at(4) },
    { id: 'g1', sourceId: 'good', topic: 'news', published: at(30) }, { id: 'x', sourceId: 'x', topic: 'mind', published: at(1) },
    { id: 'old', sourceId: 'd', topic: 'news', published: at(200) },
  ];
  const brief = pickBrief(items, { positive: new Set(['good']), now: T0 });
  assert.deepEqual(brief.map((i) => i.id), ['a1', 'b1', 'c1', 'a2', 'g1']);
  assert.equal(pickBrief([], { now: T0 }).length, 0);
  assert.match(dayKey(T0), /^\d{4}-\d{1,2}-\d{1,2}$/);
});

import { serverHealth } from '../js/logic.js';

test('serverHealth: stalled when sources are missing and nothing updated for 20+ min', () => {
  const now = T0;
  assert.equal(serverHealth([{ id: 'a', fetchedAt: now - 5 * 60e3 }], 3, now).stalled, false);
  assert.equal(serverHealth([{ id: 'a', fetchedAt: now - 3 * 3600e3 }], 3, now).stalled, true);
  assert.equal(serverHealth([{ id: 'a', fetchedAt: now - 3 * 3600e3 }], 1, now).stalled, false, 'all loaded: fine');
  assert.equal(serverHealth([], 3, now).stalled, true);
});

import { dupKey, mergeDuplicates, postTags, formatLength, normalizeFeed, seenOf } from '../js/logic.js';

test('mergeDuplicates: the same PubMed article from two searches becomes one post', () => {
  const a = { id: 'x2', sourceId: 'pm-adhd', topic: 'mind', url: 'https://pubmed.ncbi.nlm.nih.gov/41000322/?utm_source=Other&fc=1&ff=2&v=2.18', title: 'T', html: '<p>short</p>' };
  const b = { id: 'x1', sourceId: 'pm-bpd', topic: 'mind', url: 'https://pubmed.ncbi.nlm.nih.gov/41000322/?utm_source=Other&fc=9&ff=8&v=2.18', title: 'T', html: '<p>a longer abstract</p>' };
  const c = { id: 'c', sourceId: 'essays', topic: 'tao', url: 'https://example.org/post?utm_source=rss', title: 'Other' };
  assert.equal(dupKey(a), 'pmid:41000322');
  assert.equal(dupKey(c), 'url:example.org/post');
  const out = mergeDuplicates([a, b, c]);
  assert.equal(out.length, 2);
  const m = out.find((i) => i.id === 'x1');
  assert.deepEqual(m.sourceIds, ['pm-bpd', 'pm-adhd']);
  assert.deepEqual(m.dupIds, ['x2']);
  assert.equal(m.html, '<p>a longer abstract</p>');
  assert.equal(out.find((i) => i.id === 'c').sourceIds, undefined, 'single posts stay as they are');
  // a DOI cited in the text doesn't make two different essays "the same"
  const d1 = { id: 'd1', sourceId: 's', url: 'https://a.org/1', html: 'see 10.1000/xyz' };
  const d2 = { id: 'd2', sourceId: 't', url: 'https://b.org/2', html: 'see 10.1000/xyz' };
  assert.equal(mergeDuplicates([d1, d2]).length, 2);
  assert.equal(normalizeFeed({ sources: [{ id: 's', items: [a] }, { id: 't', items: [b] }] }).items.length, 1);
});

test('merged posts count for every topic and are muted only when all their sources are', () => {
  const m = { id: 'm', sourceId: 'a', sourceIds: ['a', 'b'], topic: 'mind', topics: ['mind', 'trans'], dupIds: ['m2'], published: new Date(T0).toISOString() };
  assert.deepEqual(mixFeed([m], { topic: 'trans' }).map((i) => i.id), ['m']);
  assert.equal(mixFeed([m], { muted: new Set(['a']) }).length, 1);
  assert.equal(mixFeed([m], { muted: new Set(['a', 'b']) }).length, 0);
  assert.deepEqual(newCounts([m], {}, new Set()).byTopic, { mind: 1, trans: 1 });
  assert.equal(seenOf({ m2: 1 }, m), true, 'seen under the other feed\'s id');
});

test('postTags: source tags (or the topic), then the kind of post', () => {
  const config = {
    topics: [{ id: 'mind', name: 'Mind' }, { id: 'science', name: 'Science' }],
    sources: [{ id: 'adhd', topic: 'mind', tags: ['ADHD'] }, { id: 'bpd', topic: 'mind', tags: ['BPD'] }, { id: 'k', topic: 'science' }],
  };
  assert.deepEqual(postTags({ sourceId: 'adhd', sourceIds: ['adhd', 'bpd'], kind: 'research' }, config), ['ADHD', 'BPD', 'Article']);
  assert.deepEqual(postTags({ sourceId: 'k', topic: 'science', videoId: 'v', short: true }, config), ['Science', 'Short']);
  assert.deepEqual(postTags({ sourceId: 'k', topic: 'science', videoId: 'v' }, config), ['Science', 'Video']);
  assert.deepEqual(postTags({ sourceId: 'gone', topic: 'mind', kind: 'audio' }, config), ['Mind', 'Podcast']);
});

test('formatLength', () => {
  assert.equal(formatLength(754), '12:34');
  assert.equal(formatLength(59), '0:59');
  assert.equal(formatLength(3723), '1:02:03');
  assert.equal(formatLength(0), '');
  assert.equal(formatLength(undefined), '');
});

import { retopic } from '../js/logic.js';

test('retopic: topics follow the current sources.json', () => {
  const sources = [{ id: 'psyche', topic: 'psychology' }, { id: 'pm', topic: 'mind' }];
  const [a, b, c] = retopic([
    { id: 'a', sourceId: 'psyche', topic: 'mind' },
    { id: 'b', sourceId: 'gone', topic: 'mind' },
    { id: 'c', sourceId: 'pm', sourceIds: ['pm', 'psyche'], topic: 'mind', topics: ['mind'] },
  ], sources);
  assert.equal(a.topic, 'psychology', 'moved source');
  assert.equal(b.topic, 'mind', 'a source no longer listed keeps its topic');
  assert.deepEqual(c.topics, ['mind', 'psychology'], 'a merged post counts for both');
  const same = { id: 'd', sourceId: 'pm', topic: 'mind' };
  assert.equal(retopic([same], sources)[0], same, 'unchanged posts are left as they are');
});

import { limitResetAt } from '../js/logic.js';

test('serverHealth: quiet when several sources are over an hour past their next check', () => {
  const now = T0, H = 3600e3;
  const st = (...ago) => ago.map((h, n) => ({ id: 's' + n, fetchedAt: now - h * H, every: 2 * H }));
  assert.equal(serverHealth(st(1, 1, 1), 3, now).quiet, false);
  assert.equal(serverHealth(st(4, 4, 1), 3, now).quiet, false, 'two overdue of three: not yet');
  assert.equal(serverHealth(st(4, 4, 4), 3, now).quiet, true);
  const quietNight = [{ id: 'a', fetchedAt: now - 5 * H, every: 8 * H }, { id: 'b', fetchedAt: now - 7 * H, every: 12 * H }, { id: 'n', fetchedAt: now - 4 * H, every: 2 * H }];
  assert.equal(serverHealth(quietNight, 3, now, new Map([['n', 6 * H]])).quiet, false, 'long waits and News every 6 h are not overdue');
  assert.equal(serverHealth(st(4, 4, 4), 5, now).quiet, false, 'sources still missing: that is "stalled", not "quiet"');
  assert.equal(new Date(limitResetAt(Date.UTC(2026, 8, 27, 19, 43))).toISOString(), '2026-09-28T00:00:00.000Z');
});

import { shapeFeed, capPerSource, tooOld, stampArrivals, FEED_SHAPE } from '../js/logic.js';

test('mixFeed: newest to arrive first, then newest published', () => {
  const items = [item('old-but-new', 'a', 200), item('recent', 'b', 1), item('also', 'c', 2)];
  const arrived = { 'old-but-new': T0, recent: T0 - DAY, also: T0 - DAY };
  assert.deepEqual(mixFeed(items, { arrived }).map((i) => i.id), ['old-but-new', 'recent', 'also']);
});

test('shapeFeed: a few new per source; a short "Earlier" of recently seen posts', () => {
  const news = Array.from({ length: 5 }, (_, n) => item('a' + n, 'a', n));
  const other = [item('b0', 'b', 1)];
  const seenOld = Array.from({ length: 30 }, (_, n) => item('s' + n, 'c' + (n % 10), 10 + n));
  const seen = Object.fromEntries(seenOld.map((i, n) => [i.id, n < 25 ? T0 - DAY : T0 - 5 * DAY]));
  const { fresh, older } = shapeFeed([...news, ...other, ...seenOld], seen, { now: T0 });
  assert.deepEqual(fresh.map((i) => i.id), ['a0', 'a1', 'a2', 'b0'], `at most ${FEED_SHAPE.perSource} new from one source`);
  assert.equal(older.length, FEED_SHAPE.earlierMax, 'Earlier is capped');
  assert.ok(older.every((i) => seen[i.id] === T0 - DAY), 'only posts seen in the last few days');
  assert.deepEqual(capPerSource(news, 2).map((l) => l.length), [2, 3]);
});

test('arrivals: stamped once, forgotten after they leave; a month-old arrival leaves the feed', () => {
  let { arrived, changed } = stampArrivals({}, [{ id: 'x' }], T0);
  assert.equal(changed, true);
  assert.equal(stampArrivals(arrived, [{ id: 'x' }], T0 + DAY).changed, false, 'kept its first time');
  assert.equal(tooOld({ id: 'x' }, arrived, T0 + 31 * DAY), true);
  assert.equal(tooOld({ id: 'x' }, arrived, T0 + 29 * DAY), false);
  ({ arrived } = stampArrivals(arrived, [], T0 + 61 * DAY));
  assert.equal(arrived.x, undefined, 'forgotten once gone from the feed for 2 months');
});
