// One look for posts everywhere they're listed (feed, reading list, folders).
import { h, icon } from './ui.js';
import { relTime, postTags, formatLength } from './logic.js';
import { app } from './app.js';
import { lengthOf } from './lengths.js';

export const thumbUrl = (item) => (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg` : '');
// Shorts are tall: the larger thumbnail has the whole frame in its middle, cropped to fit.
const shortThumb = (item) => `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;

// Tags: what a post is about, then what it is ("ADHD", "BPD", "Article").
export function tagsEl(item) {
  const tags = postTags(item, app.config);
  return h('ul', { class: 'tags', 'aria-label': 'Tags' }, tags.map((t) => h('li', { text: t })));
}

function mediaEl(item) {
  if (!item.videoId) return null;
  if (item.short) {
    // The feed plays Shorts here (js/shorts.js); anywhere else the post opens as usual.
    return h('div', { class: 'short-slot', 'data-video': item.videoId },
      h('img', { src: shortThumb(item), alt: '', loading: 'lazy', decoding: 'async' }),
      h('button', { type: 'button', class: 'thumb-play short-play', 'aria-label': 'Play Short: ' + item.title }, icon('play', 20)));
  }
  return h('div', { class: 'thumb', 'data-video': item.videoId },
    h('img', { src: thumbUrl(item), alt: '', loading: 'lazy', decoding: 'async' }),
    h('span', { class: 'thumb-play', 'aria-hidden': 'true' }, icon('play', 20)),
    timeEl(lengthOf(item)));
}

const timeEl = (seconds) => {
  const length = formatLength(seconds);
  return length ? h('span', { class: 'thumb-time', 'aria-label': 'Length ' + length, text: length }) : null;
};

// Saved: small marks on the meta line for the Reading list (glasses) and a bookmark.
export function savedMarks({ list = false, bookmark = false } = {}) {
  if (!list && !bookmark) return null;
  const said = [list ? 'On your reading list' : null, bookmark ? 'Bookmarked' : null].filter(Boolean).join(', ');
  return h('span', { class: 'saved-marks' },
    list ? icon('glasses', 16) : null,
    bookmark ? icon('bookmarked', 16) : null,
    h('span', { class: 'visually-hidden', text: ' · ' + said }));
}

// A length that arrived after the post was drawn.
export function showLength(root, videoId, seconds) {
  for (const t of root.querySelectorAll(`.thumb[data-video="${CSS.escape(videoId)}"]`)) {
    if (!t.querySelector('.thumb-time')) t.append(timeEl(seconds));
  }
}

/**
 * @param {object} item  a feed item or a post snapshot
 * @param {{ openedAt?: number, extra?: string[], action?: HTMLElement, saved?: { list?: boolean, bookmark?: boolean } }} opts
 *   extra: more meta (e.g. "40% read"); action: one quiet button on the meta line (e.g. remove);
 *   saved: show the reading-list / bookmark marks
 */
export function entryEl(item, { openedAt = 0, extra = [], action = null, saved = null } = {}) {
  const text = [item.sourceName, relTime(item.published), ...extra, openedAt ? 'Opened' : null].filter(Boolean).join(' · ');
  const meta = h('p', { class: 'meta' }, text, savedMarks(saved || {}));
  return h('article', { class: 'entry' + (openedAt ? ' is-read' : ''), 'data-id': item.id, 'data-post': item.id, 'data-key': 'e:' + item.id },
    mediaEl(item),
    action ? h('div', { class: 'entry-meta-row' }, meta, action) : meta,
    h('h2', { class: 'entry-title' }, h('a', { href: '#/item/' + encodeURIComponent(item.id) }, item.title)),
    item.excerpt && item.excerpt !== item.title ? h('p', { class: 'entry-excerpt', text: item.excerpt }) : null,
    tagsEl(item));
}

// A hidden post: one quiet line you can open back up.
export function hiddenEl(item, onShow) {
  return h('div', { class: 'entry-hidden', 'data-id': item.id, 'data-key': 'e:' + item.id },
    h('p', { class: 'meta', text: 'Hidden post · ' + (item.sourceName || '') }),
    h('button', { type: 'button', class: 'btn-text', onclick: onShow, 'aria-label': 'Show hidden post: ' + item.title }, 'Show'));
}
