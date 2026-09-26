// A floating "jump" button: down to the bottom, or back to the top once you're near the end.
// Drag it anywhere; it settles on the nearest side and remembers where you left it.
import { h, icon } from './ui.js';

const KEY = 'bonsai-jump';
const EDGE = 12;      // px from the screen edge
const SIZE = 44;
const DRAG = 6;       // px before a press becomes a drag
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

let btn, pos, update;

const load = () => {
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && (p.side === 'left' || p.side === 'right') && p.y >= 0 && p.y <= 1) return p; } catch { /* default */ }
  return { side: 'right', y: 0.72 };
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* this visit only */ } };

function bounds() {
  const cs = getComputedStyle(document.documentElement);
  const bar = parseFloat(cs.getPropertyValue('--bar-h')) || 56;
  const nav = document.body.dataset.route === 'read' || innerWidth >= 900 ? 0 : parseFloat(cs.getPropertyValue('--nav-h')) || 64;
  return { top: bar + EDGE + 40, bottom: innerHeight - nav - SIZE - EDGE };
}

function place() {
  const b = bounds();
  const y = Math.min(b.bottom, Math.max(b.top, pos.y * innerHeight));
  btn.style.top = y + 'px';
  btn.style.left = pos.side === 'left' ? EDGE + 'px' : 'auto';
  btn.style.right = pos.side === 'right' ? EDGE + 'px' : 'auto';
}

export function initJump() {
  pos = load();
  btn = h('button', { type: 'button', class: 'jump', hidden: true });
  document.body.appendChild(btn);
  let drag = null, justDragged = false, atEnd = null;

  update = () => {
    const doc = document.documentElement;
    const long = doc.scrollHeight > innerHeight * 2.2;
    btn.hidden = !long || Boolean(document.querySelector('dialog[open]'));
    const end = scrollY + innerHeight >= doc.scrollHeight - innerHeight * 0.6;
    if (end !== atEnd) {
      atEnd = end;
      btn.replaceChildren(icon(end ? 'arrowUp' : 'arrowDown', 22));
      btn.setAttribute('aria-label', end ? 'Back to top' : 'Jump to bottom');
    }
  };

  btn.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG) return;
    drag.moved = true;
    btn.classList.add('dragging');
    btn.style.left = Math.min(innerWidth - SIZE - EDGE, Math.max(EDGE, e.clientX - SIZE / 2)) + 'px';
    btn.style.right = 'auto';
    btn.style.top = Math.min(innerHeight - SIZE - EDGE, Math.max(EDGE, e.clientY - SIZE / 2)) + 'px';
  });
  const end = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    btn.classList.remove('dragging');
    if (!moved) return;
    justDragged = true;
    pos = { side: e.clientX < innerWidth / 2 ? 'left' : 'right', y: Math.min(1, Math.max(0, (e.clientY - SIZE / 2) / innerHeight)) };
    save();
    place();
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('click', () => {
    if (justDragged) { justDragged = false; return; }
    const top = atEnd ? 0 : document.documentElement.scrollHeight;
    window.scrollTo({ top, behavior: reduced.matches ? 'auto' : 'smooth' });
  });

  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { place(); update(); });
  new MutationObserver(onScroll).observe(document.body, { childList: true }); // sheets/menus opening
  new ResizeObserver(onScroll).observe(document.body);                    // the page got longer/shorter
  place();
  update();
}

// After a screen change (new page height, maybe no bottom nav).
export function jumpRefresh() {
  if (!btn) return;
  place();
  requestAnimationFrame(update);
}
