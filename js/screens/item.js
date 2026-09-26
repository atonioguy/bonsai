import * as db from '../db.js';
import { newSaved, relTime } from '../logic.js';
import { h, icon, toast, fmtDate } from '../ui.js';
import { sanitize } from '../sanitize.js';
import { attachSaveQuote } from '../selection.js';

export async function render(main, app, id) {
  const cache = await db.get('kv', 'feed');
  const item = cache?.items.find((i) => i.id === id);

  const back = h('div', { class: 'backrow' },
    h('a', { class: 'btn btn-text btn-quiet', href: '#/' }, icon('back', 20), 'Feed'));

  if (!item) {
    main.append(back, h('div', { class: 'empty' },
      h('h1', { class: 'screen-title', text: 'Article not found' }),
      h('p', { class: 'lead', text: 'It’s no longer in the feed.' })));
    return;
  }

  const body = sanitize(item.html || '');
  const plainBody = body.replace(/<[^>]+>/g, '').trim();
  const hasFull = plainBody.length > item.excerpt.length + 200; // more than the summary

  const source = () => ({
    topic: item.topic,
    sourceName: item.sourceName,
    sourceTitle: item.title,
    url: item.url,
  });

  const text = h('div', { class: 'prose' });
  if (body) text.innerHTML = body; // sanitized
  else text.appendChild(h('p', { text: item.excerpt }));

  const saveBtn = h('button', { type: 'button', class: 'btn btn-secondary', onclick: async () => {
    const entry = newSaved({ kind: 'quote', text: item.excerpt || item.title, ...source() });
    await db.put('saved', entry.id, entry);
    toast('Saved', { label: 'Undo', run: () => db.del('saved', entry.id) });
  } }, 'Save');

  const open = item.url
    ? h('a', { class: hasFull ? 'btn btn-secondary' : 'btn btn-primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      'Open original', icon('external', 18))
    : null;

  main.append(
    back,
    h('article', {},
      h('header', { class: 'article-head' },
        h('p', { class: 'meta', text: [item.sourceName, fmtDate(item.published) || relTime(item.published)].filter(Boolean).join(' · ') }),
        h('h1', { class: 'article-title', text: item.title }),
        item.audioUrl ? h('audio', { controls: true, preload: 'none', src: item.audioUrl }) : null),
      text,
      !hasFull && item.url ? h('p', { class: 'meta', style: 'margin-top: var(--s-5)', text: 'The full text isn’t in the feed.' }) : null,
      h('div', { class: 'article-actions' }, open, saveBtn)),
  );

  return attachSaveQuote(text, source);
}
