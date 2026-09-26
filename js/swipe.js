// Swipe a post left (touch) to reveal two quick actions on its right edge, like Gmail:
// Reading list (glasses) and Hide (crossed-out eye). A short swipe snaps open; tap a button to act,
// tap anywhere else or scroll to close. The long-press menu offers the same actions with labels.
import { h, icon } from './ui.js';
import { getPost } from './posts.js';
import { toggleReadingList, hidePost } from './postmenu.js';

const BTN = 72;     // px per button when open (the buttons get this minus an 8px gap)
const DECIDE = 10;  // px of movement before deciding between a swipe and a scroll
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * @param {HTMLElement} root   the list holding posts (.entry[data-post])
 * @param {(id:string)=>object|null} lookup
 * @param {(kind:string, item:object)=>void} onChange
 * @param {{ canHide?: () => boolean }} opts  canHide false: only the Reading list button
 * @returns {() => void} detach
 */
export function enableSwipe(root, lookup, onChange, { canHide = () => true } = {}) {
  let g = null;        // the gesture in progress
  let openEl = null;   // the post currently swiped open
  let swallow = false; // eat the click that follows a swipe or a closing tap
  let swallowTimer = 0;
  root.classList.add('swipe-on');

  const eatNextClick = () => {
    swallow = true;
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => { swallow = false; }, 400); // iOS may send no click after a drag
  };

  const place = (el, dx, animate) => {
    el.classList.add('swiping');
    el.classList.toggle('swipe-anim', animate && !reduced.matches);
    el.style.setProperty('--dx', dx + 'px');
  };

  function close(el, animate = true) {
    if (!el) return;
    if (openEl === el) openEl = null;
    place(el, 0, animate);
    const done = () => {
      if (el === openEl || g?.el === el) return; // swiped again meanwhile
      el.classList.remove('swiping', 'swipe-anim');
      el.style.removeProperty('--dx');
      el.querySelector(':scope > .swipe-actions')?.remove();
    };
    if (animate && !reduced.matches) setTimeout(done, 220); else done();
  }

  function actionsFor(el, item) {
    const have = el.querySelector(':scope > .swipe-actions');
    if (have) return have;
    const act = (fn) => () => { if (openEl === el) openEl = null; fn(item, onChange); };
    const later = h('button', { type: 'button', class: 'swipe-btn swipe-later', 'aria-label': 'Add to reading list', onclick: act(toggleReadingList) }, icon('glasses', 24));
    const hide = canHide() ? h('button', { type: 'button', class: 'swipe-btn swipe-hide', 'aria-label': 'Hide post', onclick: act(hidePost) }, icon('hide', 24)) : null;
    const bar = h('div', { class: 'swipe-actions' }, later, hide);
    bar.style.top = getComputedStyle(el).paddingTop; // line up with the post, not the space above it
    el.append(bar);
    getPost(item.id).then((p) => {
      if (p?.list) { later.setAttribute('aria-label', 'Remove from reading list'); later.classList.add('is-on'); }
    });
    return bar;
  }
  const widthOf = (el) => el.querySelectorAll(':scope > .swipe-actions .swipe-btn').length * BTN;

  const onDown = (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary || document.querySelector('dialog[open]')) return;
    const el = e.target.closest?.('.entry[data-post]');
    const inRoot = root.contains(e.target);
    if (openEl && openEl !== el) { // a tap anywhere else only closes the open post
      close(openEl);
      if (inRoot) eatNextClick();
      return;
    }
    if (!el || !inRoot || e.target.closest('.swipe-actions')) return;
    g = { el, id: e.pointerId, x: e.clientX, y: e.clientY, base: el === openEl ? -widthOf(el) : 0, off: 0, horizontal: null };
    g.off = g.base;
  };

  const onMove = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || g.base < 0);
      if (!g.horizontal) { if (g.base < 0) close(g.el); g = null; return; } // a scroll
      const item = lookup(g.el.dataset.post);
      if (!item) { g = null; return; }
      actionsFor(g.el, item);
      getSelection()?.removeAllRanges();
      try { g.el.setPointerCapture(e.pointerId); } catch { /* not supported: fine */ }
    }
    const W = widthOf(g.el);
    let off = Math.min(0, g.base + dx);
    if (off < -W) off = -W - Math.pow(-W - off, 0.7); // a little resistance past fully open
    g.off = off;
    place(g.el, off, false);
  };

  const onUp = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const was = g;
    g = null;
    if (was.horizontal) {
      eatNextClick();
      const W = widthOf(was.el);
      const stayOpen = was.off < (was.base < 0 ? -W * 0.7 : -W * 0.35);
      if (stayOpen) { openEl = was.el; place(was.el, -W, true); } else close(was.el);
    } else if (was.base < 0) { // a tap on the open post closes it instead of opening the article
      eatNextClick();
      close(was.el);
    }
  };

  const onCancel = (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (g.horizontal) onUp(e);
    else { if (g.base < 0) close(g.el); g = null; }
  };

  const onClick = (e) => {
    if (!swallow) return;
    swallow = false;
    if (root.contains(e.target) && !e.target.closest('.swipe-actions')) { e.preventDefault(); e.stopPropagation(); }
  };
  const onScroll = () => { if (openEl && !g) close(openEl); };

  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    clearTimeout(swallowTimer);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll);
    root.classList.remove('swipe-on');
  };
}
