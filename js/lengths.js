// Video lengths. YouTube's feeds don't include them, so Bonsai asks the feed server
// (GET /length?v=ID) for the videos it shows and keeps the answers on this device.
// A length that couldn't be found is asked for again after a day.
import * as db from './db.js';

const RETRY = 86_400_000;
const AT_ONCE = 2;

let map = null;          // { videoId: seconds } or { videoId: -askedAt } when not found
let saveTimer = null;
const queue = [];
const asked = new Set(); // this visit
let active = 0;

export async function loadLengths() {
  if (!map) map = (await db.get('kv', 'lengths')) || {};
  return map;
}

// Seconds, or 0 while unknown. Shorts don't show a length.
export function lengthOf(item) {
  if (!item.videoId || item.short) return 0;
  if (item.length > 0) return item.length;
  const v = map && map[item.videoId];
  return v > 0 ? v : 0;
}

/**
 * Look up the lengths still missing for these items, a couple at a time.
 * @param {object[]} items
 * @param {string} feedUrl
 * @param {(videoId: string, seconds: number) => void} onFound
 */
export function requestLengths(items, feedUrl, onFound) {
  if (!feedUrl || !map) return;
  for (const it of items) {
    const id = it.videoId;
    if (!id || it.short || lengthOf(it) || asked.has(id)) continue;
    const v = map[id];
    if (v < 0 && Date.now() + v < RETRY) continue; // not found recently
    asked.add(id);
    queue.push([id, onFound]);
  }
  pump(feedUrl.replace(/\/+$/, ''));
}

function pump(base) {
  while (active < AT_ONCE && queue.length) {
    const [id, onFound] = queue.shift();
    active++;
    fetch(base + '/length?v=' + encodeURIComponent(id))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { asked.delete(id); return; } // an older feed server without /length: try next visit
        const s = Number(d.seconds) || 0;
        map[id] = s > 0 ? s : -Date.now();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => db.put('kv', 'lengths', map), 800);
        if (s > 0) onFound(id, s);
      })
      .catch(() => { asked.delete(id); }) // offline: try again next time
      .finally(() => { active--; pump(base); });
  }
}
