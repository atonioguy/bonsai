// "Recently opened": a drawer from the top bar (not a permanent sidebar, per DESIGN.md §5).
import { h, icon } from './ui.js';
import { recent } from './posts.js';
import { relTime } from './logic.js';

export async function openRecent() {
  const posts = await recent(40);
  const dlg = h('dialog', { class: 'drawer', 'aria-labelledby': 'recent-title' });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', id: 'recent-title', text: 'Recently opened' }),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Close', onclick: close }, icon('close'))),
    posts.length
      ? h('ul', { class: 'list drawer-list' }, posts.map((p) => h('li', {},
        h('a', { class: 'drawer-row', href: '#/item/' + encodeURIComponent(p.id), onclick: close },
          h('span', { class: 'drawer-title', text: p.item.title }),
          h('span', { class: 'meta', text: [p.item.sourceName, 'opened ' + relTime(p.openedAt)].filter(Boolean).join(' · ') })))))
      : h('p', { class: 'lead', text: 'Nothing opened yet.' }));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}
