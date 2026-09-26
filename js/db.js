// IndexedDB — everything personal stays on this device.
// Stores: kv (settings, feed cache…), books, progress, saved, sessions.

const NAME = 'bonsai';
const VERSION = 2;
// v2: `posts` — your state per article (snapshot, opened, scroll, bookmark, reading list, notes).
const STORES = ['kv', 'books', 'progress', 'saved', 'sessions', 'posts'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function get(store, key) {
  const db = await open();
  return req2p(db.transaction(store).objectStore(store).get(key));
}

export async function all(store) {
  const db = await open();
  return req2p(db.transaction(store).objectStore(store).getAll());
}

export function put(store, key, value) {
  return run(store, (os) => { os.put(value, key); });
}

export function del(store, key) {
  return run(store, (os) => { os.delete(key); });
}

export function clear(store) {
  return run(store, (os) => { os.clear(); });
}

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  feedUrl: '',
  sessionMinutes: 15,
  sqUrl: '',
  sqKey: '',
  libraryId: '',
  muted: [],
};

export async function settings() {
  return { ...DEFAULT_SETTINGS, ...((await get('kv', 'settings')) || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await settings()), ...patch };
  await put('kv', 'settings', next);
  return next;
}
