// One look for posts everywhere they're listed (feed, reading list, folders).
import { h, icon } from './ui.js';
import { relTime } from './logic.js';

export const thumbUrl = (item) => (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg` : '');

/**
 * @param {object} item  a feed item or a post snapshot
 * @param {{ openedAt?: number, extra?: string[], action?: HTMLElement }} opts
 *   extra: more meta (e.g. "40% read"); action: one quiet button on the meta line (e.g. remove)
 */
export function entryEl(item, { openedAt = 0, extra = [], action = null } = {}) {
  const kind = item.videoId ? (item.short ? 'Short' : 'Video') : item.kind === 'audio' ? 'Audio' : null;
  const meta = [kind, item.sourceName, relTime(item.published), ...extra, openedAt ? 'Opened' : null].filter(Boolean).join(' · ');
  return h('article', { class: 'entry' + (openedAt ? ' is-read' : ''), 'data-id': item.id, 'data-post': item.id },
    item.videoId ? h('div', { class: 'thumb' },
      h('img', { src: thumbUrl(item), alt: '', loading: 'lazy', decoding: 'async' }),
      h('span', { class: 'thumb-play', 'aria-hidden': 'true' }, icon('play', 20))) : null,
    action ? h('div', { class: 'entry-meta-row' }, h('p', { class: 'meta', text: meta }), action) : h('p', { class: 'meta', text: meta }),
    h('h2', { class: 'entry-title' }, h('a', { href: '#/item/' + encodeURIComponent(item.id) }, item.title)),
    item.excerpt && item.excerpt !== item.title ? h('p', { class: 'entry-excerpt', text: item.excerpt }) : null);
}

// A hidden post: one quiet line you can open back up.
export function hiddenEl(item, onShow) {
  return h('div', { class: 'entry-hidden', 'data-id': item.id },
    h('p', { class: 'meta', text: 'Hidden post · ' + (item.sourceName || '') }),
    h('button', { type: 'button', class: 'btn-text', onclick: onShow, 'aria-label': 'Show hidden post: ' + item.title }, 'Show'));
}
