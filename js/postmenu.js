// Long-press (touch) or right-click (mouse) on a post: a quick preview with actions beside it.
import { h, icon, toast, sharePost } from './ui.js';
import { newListEntry, relTime } from './logic.js';
import { ensurePost, savePost, markOpened, markUnread, setHidden, openedMap } from './posts.js';
import { bookmarkSheet } from './bookmark.js';
import { thumbUrl } from './entries.js';

const LONG_PRESS = 450;
const SLOP = 10; // px of finger movement that still counts as holding still

/**
 * @param {HTMLElement} root            where posts live (elements with data-post="<id>")
 * @param {(id:string)=>object|null} lookup   id → item
 * @param {(kind:string, item:object)=>void} onChange  after an action ('list'|'bookmark'|'read'|'hidden')
 * @returns {() => void} detach
 */
export function enablePostMenu(root, lookup, onChange) {
  let timer = null, start = null, fired = false;
  const postOf = (e) => e.target.closest && e.target.closest('[data-post]');
  const open = (el) => {
    const item = lookup(el.dataset.post);
    if (item && !document.querySelector('dialog.peek[open]')) openPostMenu(item, onChange);
  };
  const onContext = (e) => { const el = postOf(e); if (!el) return; e.preventDefault(); clearTimeout(timer); open(el); };
  const onDown = (e) => {
    fired = false; // a new touch always starts fresh (iOS may send no click after a long press)
    if (e.pointerType === 'mouse') return;
    const el = postOf(e);
    if (!el) return;
    start = [e.clientX, e.clientY];
    fired = false;
    timer = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(8); open(el); }, LONG_PRESS);
  };
  const onMove = (e) => { if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > SLOP) clearTimeout(timer); };
  const onUp = () => {
    clearTimeout(timer);
    start = null;
    if (fired) setTimeout(() => { fired = false; }, 400); // only the click right after the hold is swallowed
  };
  const onClick = (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }; // the hold opened the menu, not the post
  root.addEventListener('contextmenu', onContext);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('click', onClick, true);
  return () => {
    clearTimeout(timer);
    root.removeEventListener('contextmenu', onContext);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    root.removeEventListener('click', onClick, true);
  };
}

export async function openPostMenu(item, onChange = () => {}) {
  const post = await ensurePost(item);
  const opened = Boolean((await openedMap())[item.id]);
  const dlg = h('dialog', { class: 'peek', 'aria-label': 'Post: ' + item.title });
  const close = () => dlg.close();
  const href = '#/item/' + encodeURIComponent(item.id);

  const img = thumbUrl(item) || item.image;
  const card = h('article', { class: 'peek-card' },
    img ? h('img', { class: 'peek-img', src: img, alt: '', decoding: 'async' }) : null,
    h('p', { class: 'meta', text: [item.sourceName, relTime(item.published)].filter(Boolean).join(' · ') }),
    h('h2', { class: 'peek-title', text: item.title }),
    item.excerpt && item.excerpt !== item.title ? h('p', { class: 'peek-excerpt', text: item.excerpt }) : null,
    h('a', { class: 'btn btn-primary', href, onclick: close }, 'Open'));

  const act = (label, name, run) => h('button', { type: 'button', class: 'peek-action', role: 'menuitem', onclick: async () => { close(); await run(); } },
    icon(name, 20), h('span', { text: label }));

  const menu = h('div', { class: 'peek-menu', role: 'menu', 'aria-label': 'Actions' },
    act(post.list ? 'Remove from reading list' : 'Add to reading list', post.list ? 'listed' : 'listAdd', async () => {
      const was = post.list;
      post.list = was ? null : newListEntry();
      await savePost(post);
      onChange('list', item);
      toast(was ? 'Removed from reading list' : 'Added to reading list', { label: 'Undo', run: async () => { post.list = was; await savePost(post); onChange('list', item); } });
    }),
    act(post.bookmark ? 'Bookmark folders' : 'Bookmark', post.bookmark ? 'bookmarked' : 'bookmark', async () => {
      if (post.bookmark) return bookmarkSheet(post, { onChange: () => onChange('bookmark', item) });
      post.bookmark = { at: Date.now(), folders: [] };
      await savePost(post);
      onChange('bookmark', item);
      toast('Bookmarked', { label: 'Add to folder', run: () => bookmarkSheet(post, { onChange: () => onChange('bookmark', item) }) });
    }),
    act(opened ? 'Mark as unread' : 'Mark as read', opened ? 'unread' : 'check', async () => {
      if (opened) await markUnread(item.id); else await markOpened(item);
      onChange('read', item);
    }),
    act('Share', 'share', () => sharePost(item)),
    act('Hide post', 'hide', async () => {
      await setHidden(item.id, true);
      onChange('hidden', item);
      toast('Post hidden', { label: 'Undo', run: async () => { await setHidden(item.id, false); onChange('hidden', item); } });
    }));

  dlg.append(h('div', { class: 'peek-inner' }, card, menu));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  menu.querySelector('button').focus();
}
