import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THROWBACK_DAYS, newSaved, dueThrowbacks, afterShown,
  mixFeed, composeFeed, relTime, weekStart, weekSummary, foliageScale,
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
