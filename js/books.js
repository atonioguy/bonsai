// Book index + reading progress. Full book text lives in the `books` store; the small index
// (kv 'bookIndex') is what lists and the feed card read, so they never load whole books.
import * as db from './db.js';
import { parseEpub } from './epub.js';

export async function bookIndex() {
  return (await db.get('kv', 'bookIndex')) || [];
}

export async function addBook(file) {
  const parsed = await parseEpub(await file.arrayBuffer());
  const id = 'b' + Date.now().toString(36);
  await db.put('books', id, { id, ...parsed });
  const meta = {
    id,
    title: parsed.title,
    author: parsed.author,
    chapterTitles: parsed.chapters.map((c) => c.title),
    chapterWords: parsed.chapters.map((c) => c.words),
    addedAt: Date.now(),
  };
  await db.put('kv', 'bookIndex', [...(await bookIndex()), meta]);
  return meta;
}

export async function removeBook(id) {
  await db.del('books', id);
  await db.del('progress', id);
  await db.put('kv', 'bookIndex', (await bookIndex()).filter((b) => b.id !== id));
}

export async function progress(id) {
  return (await db.get('progress', id)) || { chapter: 0, ratio: 0, updatedAt: 0 };
}

export function saveProgress(id, p) {
  return db.put('progress', id, { ...p, updatedAt: Date.now() });
}

// Share of the book read, 0…1, weighted by words.
export function fraction(meta, p) {
  const words = meta.chapterWords || [];
  const total = words.reduce((a, b) => a + b, 0) || 1;
  const before = words.slice(0, p.chapter).reduce((a, b) => a + b, 0);
  return Math.min(1, (before + (words[p.chapter] || 0) * (p.ratio || 0)) / total);
}

export const percent = (f) => Math.round(f * 100) + '%';

// The book for the feed's "Continue reading" card: most recently read, not finished.
export async function currentBook() {
  const index = await bookIndex();
  if (!index.length) return null;
  const withP = await Promise.all(index.map(async (m) => {
    const p = await progress(m.id);
    return { meta: m, p, f: fraction(m, p) };
  }));
  const open = withP.filter((x) => x.f < 0.99);
  if (!open.length) return null;
  open.sort((a, b) => (b.p.updatedAt || b.meta.addedAt) - (a.p.updatedAt || a.meta.addedAt));
  return open[0];
}
