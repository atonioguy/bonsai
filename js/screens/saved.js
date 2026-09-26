import * as db from '../db.js';
import { weekSummary, foliageScale, relTime } from '../logic.js';
import { h, icon, svg, toast } from '../ui.js';
import { sourceLine } from './feed.js';

// Where each topic's foliage sits on the tree (viewBox 360×300), trunk-side first.
const SPOTS = [
  { x: 180, y: 70, rx: 62, ry: 30 },   // crown
  { x: 84, y: 118, rx: 52, ry: 25 },
  { x: 278, y: 110, rx: 52, ry: 25 },
  { x: 100, y: 186, rx: 44, ry: 21 },
  { x: 262, y: 178, rx: 46, ry: 21 },
];

export async function render(main, app) {
  const [saved, sessions] = await Promise.all([db.all('saved'), db.all('sessions')]);
  saved.sort((a, b) => b.savedAt - a.savedAt);
  const week = weekSummary({ sessions, saved });

  const counts = new Map();
  for (const x of saved) counts.set(x.topic, (counts.get(x.topic) || 0) + 1);
  const topics = app.config.topics.slice(0, SPOTS.length);

  const foliage = topics.map((t, i) => {
    const sp = SPOTS[i], k = foliageScale(counts.get(t.id) || 0);
    return `<ellipse cx="${sp.x}" cy="${sp.y}" rx="${(sp.rx * k).toFixed(1)}" ry="${(sp.ry * k).toFixed(1)}" fill="var(--sage)" opacity="${(0.7 + 0.3 * k).toFixed(2)}"/>`;
  }).join('');
  const tree = svg(
    `<path d="M180 262C176 236 160 222 166 196C171 176 190 168 184 140C180 118 186 104 182 92" stroke="var(--bark)" stroke-width="13" fill="none" stroke-linecap="round"/>
     <path d="M170 200C150 196 130 192 112 186M180 172C205 172 230 174 252 178M184 134C160 128 126 124 96 120M184 118C212 114 240 112 266 112" stroke="var(--bark)" stroke-width="6" fill="none" stroke-linecap="round"/>
     <rect x="112" y="258" width="136" height="12" rx="5" fill="var(--clay-dark)"/>
     <path d="M124 270H236L224 294H136Z" fill="var(--clay)"/>` + foliage,
    { viewBox: '0 34 360 266', class: 'tree', role: 'img', 'aria-hidden': 'false',
      'aria-label': 'Saved quotes by topic: ' + topics.map((t) => `${t.name} ${counts.get(t.id) || 0}`).join(', ') });

  const byTopic = h('p', { class: 'meta', style: 'text-align: center; margin-top: var(--s-3)', 'aria-hidden': 'true',
    text: topics.map((t) => `${t.name} ${counts.get(t.id) || 0}`).join(' · ') });
  const weekLine = h('p', { class: 'week lead', text: `This week: ${week.minutes} min read · ${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'} · ${week.saved} saved` });

  const list = saved.length
    ? h('ul', { class: 'saved-list' }, saved.map((x) => itemEl(x)))
    : h('div', { class: 'empty' },
      h('h2', { text: 'Nothing saved yet' }),
      h('p', { class: 'lead', text: 'Select text in an article or book, then tap Save quote.' }),
      h('a', { class: 'btn btn-secondary', href: '#/' }, 'Go to feed'));

  function itemEl(x) {
    const li = h('li', { class: 'saved-item' },
      h('blockquote', { class: 'quote' + (x.kind === 'note' ? ' note' : ''), text: x.kind === 'note' ? x.text : '“' + x.text + '”' }),
      h('div', { class: 'saved-foot' },
        h('p', { class: 'meta', text: [sourceLine(x), relTime(x.savedAt)].filter(Boolean).join(' · ') }),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Delete quote', onclick: async () => {
          await db.del('saved', x.id);
          li.remove();
          toast('Deleted', { label: 'Undo', run: async () => { await db.put('saved', x.id, x); render.again(main, app); } });
        } }, icon('trash', 20))));
    return li;
  }

  main.append(h('h1', { class: 'screen-title', text: 'Saved' }), tree, byTopic, weekLine, list);
}

render.again = (main, app) => { main.replaceChildren(); return render(main, app); };

