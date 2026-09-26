// Pull down at the top of the feed to refresh it (touch). A round arrow follows your finger and
// turns; let go past the mark and it spins until the refresh is done.
import { h, icon } from './ui.js';

const TRIGGER = 72; // px of pull (after resistance) that refreshes
const MAX = 110;

/**
 * @param {() => Promise<void>} onRefresh
 * @returns {() => void} detach
 */
export function enablePull(onRefresh) {
  const mark = h('div', { class: 'pull', 'aria-hidden': 'true' }, icon('refresh', 22));
  document.body.appendChild(mark);
  const root = document.documentElement;
  const prevOverscroll = root.style.overscrollBehaviorY;
  root.style.overscrollBehaviorY = 'contain'; // no browser reload on the same gesture
  let g = null, busy = false;

  const show = (d) => {
    mark.style.setProperty('--pull', d + 'px');
    mark.style.setProperty('--turn', (d / TRIGGER) * 300 + 'deg');
    mark.classList.toggle('ready', d >= TRIGGER);
    mark.classList.add('show');
  };
  const hide = () => { mark.classList.remove('show', 'ready', 'busy'); mark.style.setProperty('--pull', '0px'); };

  const onStart = (e) => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || document.querySelector('dialog[open]')) { g = null; return; }
    g = { x: e.touches[0].clientX, y: e.touches[0].clientY, d: 0, live: false };
  };
  const onMove = (e) => {
    if (!g) return;
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
    if (!g.live) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) { g = null; return; } // a scroll or a swipe
      g.live = true;
    }
    g.d = Math.min(MAX, Math.max(0, dy) * 0.5);
    show(g.d);
  };
  const onEnd = async () => {
    if (!g) return;
    const go = g.live && g.d >= TRIGGER;
    g = null;
    if (!go) { hide(); return; }
    busy = true;
    mark.classList.add('busy');
    show(TRIGGER);
    try { await onRefresh(); } finally { busy = false; hide(); }
  };

  addEventListener('touchstart', onStart, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });
  addEventListener('touchend', onEnd);
  addEventListener('touchcancel', onEnd);
  return () => {
    removeEventListener('touchstart', onStart);
    removeEventListener('touchmove', onMove);
    removeEventListener('touchend', onEnd);
    removeEventListener('touchcancel', onEnd);
    root.style.overscrollBehaviorY = prevOverscroll;
    mark.remove();
  };
}
