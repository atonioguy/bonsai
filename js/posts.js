// Your state per article, kept on this device. The feed rotates old items out, so anything you
// open, bookmark or queue keeps its own snapshot here and stays readable.
//   posts store: { id, item, openedAt, scroll, bookmark: { at, folders[] } | null,
//                  list: { addedAt, dueAt, stage } | null, reaction, notes: [{ id, text, at }] }
//   kv 'opened': { [id]: time }  — small index for read/unread and Recent
//   kv 'seen':   { [id]: time }  — items that have been on screen (for "new" counts)
//   kv 'folders': [{ id, name, createdAt }]
import * as db from './db.js';
import { newListEntry } from './logic.js';

const SNAPSHOT_KEYS = ['id', 'sourceId', 'sourceName', 'topic', 'kind', 'title', 'url', 'published', 'excerpt', 'html', 'audioUrl', 'image'];
const OPENED_CAP = 3000;
const SEEN_CAP = 6000;

const snapshot = (item) => Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, item[k] ?? '']));
const blank = (item) => ({ id: item.id, item: snapshot(item), openedAt: 0, scroll: 0, bookmark: null, list: null, reaction: null, notes: [] });

export async function getPost(id) {
  return db.get('posts', id);
}

// Load (or start) the post record, refreshing its snapshot from a newer feed copy.
export async function ensurePost(item) {
  const existing = await getPost(item.id);
  const post = existing ? { ...existing, item: item.html || !existing.item.html ? snapshot(item) : existing.item } : blank(item);
  return post;
}

export function savePost(post) {
  return db.put('posts', post.id, post);
}

export async function update(item, fn) {
  const post = await ensurePost(item);
  const next = fn(post) || post;
  await savePost(next);
  return next;
}

// ---------- opened (read/unread, Recent) ----------
export async function openedMap() {
  return (await db.get('kv', 'opened')) || {};
}

export async function markOpened(item) {
  const now = Date.now();
  await update(item, (p) => { p.openedAt = now; });
  const map = await openedMap();
  map[item.id] = now;
  const ids = Object.keys(map);
  if (ids.length > OPENED_CAP) ids.sort((a, b) => map[a] - map[b]).slice(0, ids.length - OPENED_CAP).forEach((k) => delete map[k]);
  await db.put('kv', 'opened', map);
}

export async function recent(limit = 30) {
  const map = await openedMap();
  const ids = Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, limit);
  return (await Promise.all(ids.map(getPost))).filter(Boolean);
}

// ---------- seen (new counts) ----------
export async function seenMap() {
  return db.get('kv', 'seen');
}

export async function markSeen(ids) {
  if (!ids.length) return;
  const map = (await db.get('kv', 'seen')) || {};
  const now = Date.now();
  for (const id of ids) map[id] = map[id] || now;
  const keys = Object.keys(map);
  if (keys.length > SEEN_CAP) keys.sort((a, b) => map[a] - map[b]).slice(0, keys.length - SEEN_CAP).forEach((k) => delete map[k]);
  await db.put('kv', 'seen', map);
}

// ---------- folders ----------
export async function folders() {
  return (await db.get('kv', 'folders')) || [];
}

export async function addFolder(name) {
  const list = await folders();
  const f = { id: 'f' + Date.now().toString(36), name: name.trim().slice(0, 60), createdAt: Date.now() };
  await db.put('kv', 'folders', [...list, f]);
  return f;
}

export async function renameFolder(id, name) {
  await db.put('kv', 'folders', (await folders()).map((f) => (f.id === id ? { ...f, name: name.trim().slice(0, 60) } : f)));
}

// Deleting a folder keeps its bookmarks (they stay under All bookmarks).
export async function deleteFolder(id) {
  await db.put('kv', 'folders', (await folders()).filter((f) => f.id !== id));
  for (const p of await db.all('posts')) {
    if (p.bookmark?.folders.includes(id)) {
      p.bookmark.folders = p.bookmark.folders.filter((x) => x !== id);
      await savePost(p);
    }
  }
}

// ---------- bookmarks & reading list ----------
export function setBookmark(item, on, folderIds) {
  return update(item, (p) => {
    p.bookmark = on ? { at: p.bookmark?.at || Date.now(), folders: folderIds ?? p.bookmark?.folders ?? [] } : null;
  });
}

export function setListed(item, on) {
  return update(item, (p) => { p.list = on ? (p.list || newListEntry()) : null; });
}

export async function allPosts() {
  return db.all('posts');
}

// ---------- scroll ----------
export function saveScroll(item, ratio) {
  return update(item, (p) => { p.scroll = ratio; });
}

// ---------- read / unread by hand ----------
export async function markUnread(id) {
  const map = await openedMap();
  delete map[id];
  await db.put('kv', 'opened', map);
  const p = await getPost(id);
  if (p) { p.openedAt = 0; await savePost(p); }
}

// ---------- hidden posts (collapsed to one line in the feed, can be shown again) ----------
export async function hiddenMap() {
  return (await db.get('kv', 'hidden')) || {};
}

export async function setHidden(id, on) {
  const map = await hiddenMap();
  if (on) map[id] = Date.now(); else delete map[id];
  await db.put('kv', 'hidden', map);
  return map;
}
