// "Save quote": select text inside a reading container, a bar appears, tap to save.
import * as db from './db.js';
import { newSaved } from './logic.js';
import { h, toast } from './ui.js';

const MIN = 3, MAX = 800;

/**
 * @param {HTMLElement} container  where selections count
 * @param {() => object} source    fields describing where the quote came from
 * @returns {() => void} detach
 */
export function attachSaveQuote(container, source) {
  const bar = h('div', { class: 'selbar', role: 'region', 'aria-label': 'Selection' });
  const btn = h('button', { type: 'button', class: 'btn' }, 'Save quote');
  bar.appendChild(btn);
  document.body.appendChild(bar);

  let text = '';
  function current() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return '';
    const t = sel.toString().replace(/\s+/g, ' ').trim();
    return t.length >= MIN ? t.slice(0, MAX) : '';
  }
  function update() {
    text = current();
    bar.classList.toggle('show', Boolean(text));
  }
  // keep the bar from stealing the selection on tap
  btn.addEventListener('pointerdown', (e) => e.preventDefault());
  btn.addEventListener('click', async () => {
    const t = text || current();
    if (!t) return;
    const entry = newSaved({ kind: 'quote', text: t, ...source() });
    await db.put('saved', entry.id, entry);
    document.getSelection()?.removeAllRanges();
    update();
    toast('Quote saved', { label: 'Undo', run: () => db.del('saved', entry.id) });
  });

  document.addEventListener('selectionchange', update);
  return () => {
    document.removeEventListener('selectionchange', update);
    bar.remove();
  };
}
