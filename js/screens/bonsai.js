// Your bonsai: it grows as you use the app. Trunk and crown grow with everything you do;
// each topic grows its own branch when you read in it. A few details arrive with age.
import * as db from '../db.js';
import { growth, totals, weekStart, STAGES } from '../logic.js';
import { h, svg } from '../ui.js';
import { allPosts } from '../posts.js';
import { bookIndex } from '../books.js';

export async function render(main, app) {
  const [sessions, posts, quotes, books, last] = await Promise.all([
    db.all('sessions'), allPosts(), db.all('saved'), bookIndex(), db.get('kv', 'bonsaiLast'),
  ]);
  const bookTopics = Object.fromEntries(books.map((b) => [b.id, b.topic]));
  const gr = growth({ sessions, posts, quotes, bookTopics });
  const grew = last != null && gr.points > last ? gr.points - last : 0;
  await db.put('kv', 'bonsaiLast', gr.points);

  const topics = app.config.topics.slice(0, 5);
  const week = totals({ sessions, posts }, weekStart());
  const ever = totals({ sessions, posts });

  // Frame the drawing to the tree's height so a young tree isn't lost in empty sky.
  const top = gr.stage === 0 ? 200 : Math.max(0, Math.round(270 - (70 + 150 * gr.g) - 50));
  const tree = svg(drawTree(gr, topics), {
    viewBox: `0 ${top} 360 ${320 - top}`, class: 'bonsai' + (grew ? ' grew' : ''), role: 'img', 'aria-hidden': 'false',
    'aria-label': `Your bonsai: ${gr.name}, stage ${gr.stage + 1} of ${STAGES.length}`,
  });

  const pct = Math.round(gr.progress * 100);
  const line = (label, t) => h('p', { class: 'lead' },
    h('span', { class: 'label', text: label + ' ' }),
    `${t.minutes} min read · ${t.sessions} ${t.sessions === 1 ? 'session' : 'sessions'} · ${t.finished} ${t.finished === 1 ? 'article' : 'articles'} finished`);
  const topicLine = topics.map((t) => `${t.name} ${gr.byTopic[t.id] || 0}`).join(' · ');

  main.append(
    h('h1', { class: 'screen-title', text: 'Bonsai' }),
    tree,
    h('div', { class: 'stage' },
      h('p', { class: 'stage-name', text: gr.name }),
      h('p', { class: 'meta', text: gr.next
        ? `Stage ${gr.stage + 1} of ${STAGES.length} · ${gr.points} of ${gr.next.at} points to ${gr.next.name}`
        : `Stage ${gr.stage + 1} of ${STAGES.length} · ${gr.points} points` }),
      gr.next ? h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Growth to next stage', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        h('div', { class: 'progress-fill', style: `width: ${pct}%` })) : null,
      grew ? h('p', { class: 'meta status-ok', role: 'status', text: `Grew ${grew} ${grew === 1 ? 'point' : 'points'} since your last visit.` }) : null),
    h('p', { class: 'hint', text: 'It grows as you read: minutes in books, finished sessions and articles, saved quotes and notes. Each topic grows its own branch.' }),
    h('section', { class: 'section stats' },
      line('This week:', week),
      line('All time:', ever),
      h('p', { class: 'meta', text: 'Points by topic: ' + topicLine })),
  );
}

// ---------- drawing ----------
const BRANCHES = [ // crown first, then alternating sides lower down
  { t: 1, side: 0 },
  { t: 0.66, side: -1 },
  { t: 0.76, side: 1 },
  { t: 0.42, side: -1 },
  { t: 0.52, side: 1 },
];

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

const f = (n) => n.toFixed(1);

function pad(x, y, rx, cls = '') {
  const ry = rx * 0.46;
  return `<g class="pad ${cls}" style="transform-origin: ${f(x)}px ${f(y)}px">
    <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="var(--sage)"/>
    <ellipse cx="${f(x - rx * 0.45)}" cy="${f(y - ry * 0.55)}" rx="${f(rx * 0.55)}" ry="${f(ry * 0.6)}" fill="var(--sage)" opacity=".75"/>
    <ellipse cx="${f(x + rx * 0.4)}" cy="${f(y - ry * 0.6)}" rx="${f(rx * 0.5)}" ry="${f(ry * 0.55)}" fill="var(--sage)" opacity=".6"/>
  </g>`;
}

export function drawTree(gr, topics) {
  const pot = `<ellipse cx="180" cy="271" rx="62" ry="5" fill="var(--bark)" opacity=".45"/>
    <rect x="110" y="270" width="140" height="12" rx="5" fill="var(--clay-dark)"/>
    <path d="M122 282H238L226 306H134Z" fill="var(--clay)"/>`;

  if (gr.stage === 0) { // a seed just breaking the soil
    const s = 8 + 14 * gr.progress;
    return `<path d="M180 270C180 ${f(270 - s * 0.5)} 181 ${f(270 - s * 0.8)} 180 ${f(270 - s)}" stroke="var(--bark)" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g class="pad" style="transform-origin: 180px ${f(270 - s)}px">
        <ellipse cx="${f(174 - s * 0.15)}" cy="${f(268 - s)}" rx="${f(4 + s * 0.3)}" ry="${f(2 + s * 0.12)}" fill="var(--sage)" transform="rotate(-25 ${f(174 - s * 0.15)} ${f(268 - s)})"/>
        <ellipse cx="${f(186 + s * 0.15)}" cy="${f(268 - s)}" rx="${f(4 + s * 0.3)}" ry="${f(2 + s * 0.12)}" fill="var(--sage)" transform="rotate(25 ${f(186 + s * 0.15)} ${f(268 - s)})"/>
      </g>` + pot;
  }

  const g = gr.g;
  const H = 70 + 150 * g, W = 6 + 14 * g;
  const P = [[180, 270], [180 + 26 * g, 270 - H * 0.35], [180 - 30 * g, 270 - H * 0.7], [186, 270 - H]];
  let branches = '', pads = '', blossoms = '';

  BRANCHES.forEach((b, i) => {
    const topic = topics[i];
    const pts = topic ? gr.byTopic[topic.id] || 0 : 0;
    if (b.side !== 0 && pts <= 0) return; // a side branch appears once you read in its topic
    const sz = b.side === 0 ? g : Math.min(1, Math.sqrt(pts / 300));
    const [sx, sy] = bez(...P, b.t);
    let tx = sx, ty = sy - 6;
    if (b.side !== 0) {
      const L = (38 + 72 * g) * (0.55 + 0.45 * sz);
      tx = sx + b.side * L;
      ty = sy - L * 0.3;
      branches += `<path d="M${f(sx)} ${f(sy)}Q${f(sx + b.side * L * 0.55)} ${f(sy + 8)} ${f(tx)} ${f(ty)}" stroke="var(--bark)" stroke-width="${f(Math.max(3, W * 0.42))}" fill="none" stroke-linecap="round"/>`;
    }
    const rx = (16 + 36 * g) * (0.55 + 0.45 * sz) * (b.side === 0 ? 1.25 : 1);
    pads += pad(tx, ty, rx);
    if (gr.stage >= 5) {
      for (const [dx, dy] of [[-0.5, -0.1], [0.3, -0.35], [0.55, 0.1]]) {
        blossoms += `<circle cx="${f(tx + rx * dx)}" cy="${f(ty + rx * 0.46 * dy)}" r="2.6" fill="var(--clay)"/>`;
      }
    }
  });
  if (gr.stage >= 6) { const [cx, cy] = bez(...P, 1); pads += pad(cx - 8, cy - 34 * g, 30 * g, 'top'); }

  const trunk = `<path d="M${P[0]}C${P[1].map(f)} ${P[2].map(f)} ${P[3].map(f)}" stroke="var(--bark)" stroke-width="${f(W)}" fill="none" stroke-linecap="round"/>`;
  const moss = gr.stage >= 3 ? `<ellipse cx="150" cy="269" rx="12" ry="3" fill="var(--sage)" opacity=".8"/><ellipse cx="206" cy="269" rx="9" ry="2.5" fill="var(--sage)" opacity=".7"/>` : '';
  const stone = gr.stage >= 4 ? `<ellipse cx="226" cy="266" rx="9" ry="5" fill="var(--beige)"/>` : '';
  return branches + trunk + pot + moss + stone + pads + blossoms;
}
