import * as db from '../db.js';
import { newSaved, shouldLog, SQ_MIN_SEC } from '../logic.js';
import { h, icon, enso, setEnso, svg, TREE_MARK } from '../ui.js';
import { bookIndex, progress, saveProgress, fraction, percent } from '../books.js';
import { attachSaveQuote } from '../selection.js';
import { logSession, isConnected } from '../sidequest.js';
import { readControls } from '../readtools.js';

const IDLE = 90_000;       // no input for this long pauses the clock
const MIN_KEEP = 60;       // sessions shorter than this aren't recorded at all

/**
 * #/read/:bookId/free  — free read: counts all active time, logged when you leave or tap Done
 * #/read/:bookId/15    — timed session (5, 15 or 25 min): counts only if you finish it
 */
export async function render(main, app, bookId, modeParam = 'free') {
  const [book, index] = await Promise.all([db.get('books', bookId), bookIndex()]);
  const meta = index.find((b) => b.id === bookId);
  if (!book || !meta) {
    main.append(h('div', { class: 'book-text' },
      h('a', { class: 'btn btn-text btn-quiet', href: '#/library' }, icon('back', 20), 'Library'),
      h('div', { class: 'empty' }, h('h1', { class: 'screen-title', text: 'Book not found' }))));
    return;
  }

  const s = app.settings;
  const free = modeParam === 'free' || !(Number(modeParam) > 0);
  const target = free ? 0 : Number(modeParam) * 60;
  let p = await progress(bookId);
  let detachQuote = null;
  let session = null;

  // ---------- clock ----------
  let lastInput = Date.now();
  const touch = () => { lastInput = Date.now(); };
  const inputs = ['scroll', 'pointerdown', 'keydown', 'touchstart', 'wheel'];
  inputs.forEach((e) => window.addEventListener(e, touch, { passive: true }));

  function startSession() {
    const now = Date.now();
    session = {
      id: 'r' + now.toString(36), bookId, bookTitle: meta.title,
      mode: free ? 'free' : 'timed', minutes: free ? null : target / 60,
      start: now, lastActive: now, activeSec: 0, open: true, complete: false, synced: false,
    };
    touch();
  }

  // Kept in storage while reading, so a free read survives the app being swiped away
  // (it's closed and logged on the next launch; see retryPending).
  const persist = () => (session.activeSec >= MIN_KEEP ? db.put('sessions', session.id, session) : Promise.resolve());

  const ring = free ? null : enso(0, 32);
  const timeText = h('span', { class: 'time' });
  const doneBtn = free ? h('button', { type: 'button', class: 'btn btn-text', onclick: () => finish() }, 'Done') : null;
  const tools = readControls();
  const bar = h('header', { class: 'reader-bar' },
    h('a', { class: 'btn-icon', href: '#/', 'aria-label': 'Close book' }, icon('back')),
    h('span', { class: 'title', text: meta.title }),
    timeText,
    ring || doneBtn,
    tools.button,
    tools.theme,
    tools.panel);

  function paintClock() {
    if (free) {
      timeText.textContent = Math.floor(session.activeSec / 60) + ' min';
    } else {
      timeText.textContent = Math.ceil(Math.max(0, target - session.activeSec) / 60) + ' min left';
      setEnso(ring, session.activeSec / target);
    }
  }

  const tick = setInterval(() => {
    if (!session || !session.open) return;
    if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE) {
      session.activeSec += 1;
      session.lastActive = Date.now();
      if (session.activeSec % 15 === 0) { paintClock(); persist(); }
      if (!free && session.activeSec >= target) finish();
    }
  }, 1000);
  const onHide = () => { if (session && session.open && document.visibilityState === 'hidden') persist(); };
  document.addEventListener('visibilitychange', onHide);

  // ---------- text ----------
  const textWrap = h('div', { class: 'book-text' });
  let saveTimer = null;
  const onScroll = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      p = { ...p, ratio: max > 0 ? Math.min(1, window.scrollY / max) : 1 };
      saveProgress(bookId, p);
    }, 800);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  function showChapter(i, ratio = 0) {
    p = { chapter: i, ratio };
    saveProgress(bookId, p);
    const ch = book.chapters[i];
    const prose = h('div', { class: 'prose' });
    prose.innerHTML = ch.html; // sanitized at import
    const nav = h('nav', { class: 'chapter-nav', 'aria-label': 'Sections' },
      i > 0 ? h('button', { type: 'button', class: 'btn btn-text', onclick: () => showChapter(i - 1) }, 'Previous') : h('span'),
      i < book.chapters.length - 1
        ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => showChapter(i + 1) }, 'Next section')
        : h('p', { class: 'meta', text: 'End of book' }));
    textWrap.replaceChildren(
      h('p', { class: 'meta', text: `${ch.title} · ${i + 1} of ${book.chapters.length}` }),
      prose, nav);
    if (detachQuote) detachQuote();
    detachQuote = attachSaveQuote(prose, () => ({
      topic: meta.topic || '', sourceName: meta.title, sourceTitle: ch.title, bookId,
    }));
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, ratio * Math.max(0, max));
    });
  }

  // Close the session: a free read counts if it's at least a minute; a timed one only when finished.
  async function close() {
    session.open = false;
    session.end = Date.now();
    session.complete = free ? session.activeSec >= MIN_KEEP : session.activeSec >= target;
    if (session.activeSec >= MIN_KEEP || session.complete) await db.put('sessions', session.id, session);
  }

  // ---------- complete ----------
  async function finish() {
    await close();
    const f = fraction(meta, p);
    const mins = Math.max(free ? 0 : 1, Math.round(session.activeSec / 60));
    const status = h('p', { class: 'meta', role: 'status' });
    const logIt = shouldLog(session) && isConnected(s);
    if (!isConnected(s)) status.append('Not connected to Side Quest. ', h('a', { href: '#/settings' }, 'Set up'));
    else if (free && session.activeSec < SQ_MIN_SEC) status.textContent = 'Under 5 min, so it isn’t sent to Side Quest.';
    else status.textContent = 'Logging to Side Quest…';

    const note = h('input', { class: 'input', id: 'takeaway', type: 'text', autocomplete: 'off', maxlength: '300' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const text = note.value.trim();
        if (!text) return;
        const entry = newSaved({ kind: 'note', text, topic: meta.topic || '', sourceName: meta.title, sourceTitle: 'Your takeaway', bookId });
        await db.put('saved', entry.id, entry);
        form.replaceChildren(h('p', { class: 'meta', role: 'status', text: 'Takeaway saved.' }));
      },
    },
    h('label', { class: 'label', for: 'takeaway' }, 'Add a takeaway ', h('span', { class: 'meta', text: '(optional)' })),
    h('div', { class: 'inline-field' }, note, h('button', { type: 'submit', class: 'btn btn-secondary' }, 'Save')));

    const big = svg(
      `<circle cx="100" cy="100" r="80" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="440 503" transform="rotate(-62 100 100)"/>` +
      `<circle cx="100" cy="100" r="75" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="300 471" transform="rotate(-40 100 100)" opacity=".35"/>` +
      `<g transform="translate(57 52) scale(.72)">${TREE_MARK}</g>`,
      { viewBox: '0 0 200 200', width: 176, height: 176 });

    bar.remove();
    if (detachQuote) { detachQuote(); detachQuote = null; }
    main.replaceChildren(h('section', { class: 'complete', 'aria-labelledby': 'done-title' },
      big,
      h('div', {},
        h('h1', { id: 'done-title', text: !free ? 'Session complete' : session.activeSec < 60 ? 'Under 1 min read' : `${mins} min read` }),
        h('p', { class: 'meta', text: `${free ? 'Free read' : mins + ' min'} · ${meta.title} · ${percent(f)} read` })),
      status,
      form,
      h('div', { class: 'actions' },
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to feed'),
        h('button', { type: 'button', class: 'btn btn-text', onclick: () => { build(); } }, 'Keep reading'))));
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);

    if (logIt) {
      const r = await logSession(session, s);
      status.textContent = r === 'logged'
        ? (free ? 'Logged to Side Quest as a stopwatch session.' : 'Logged to Side Quest as a focus session.')
        : 'Couldn’t reach Side Quest. It will retry next time you open Bonsai.';
      status.className = 'meta ' + (r === 'logged' ? 'status-ok' : 'status-warn');
    }
  }

  function build() {
    startSession();
    main.replaceChildren(bar, textWrap);
    paintClock();
    showChapter(p.chapter, p.ratio);
  }

  build();

  return async () => {
    clearInterval(tick);
    clearTimeout(saveTimer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onHide);
    tools.detach();
    inputs.forEach((e) => window.removeEventListener(e, touch));
    if (detachQuote) detachQuote();
    // Leaving mid-read: a free read still counts (and is sent); an unfinished timed one doesn't.
    if (session && session.open) {
      await close();
      if (shouldLog(session) && isConnected(s)) logSession(session, s);
    }
  };
}
