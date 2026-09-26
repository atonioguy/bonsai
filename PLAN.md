# Bonsai — plan

A calm feed for learning. It keeps what's good about Reddit and Twitter (short
cards, an endless scroll, something new every time) but fills the feed with
research, essays, history, audio and your own books. The scroll should leave you
knowing more instead of feeling worse.

Status: **design stage.** Nothing is built yet. The first look is on the design
canvas: https://claude.ai/artifact/LMQpZUb8NpK9yZCU77PUkx (private to the owner).

---

## Decisions so far

- **Phone first.** An installable web app (PWA), like Side Quest.
- **Solo.** No accounts, comments or social features.
- **For curiosity**, not coursework.
- **Its own look**, completely separate from Side Quest's pixel art: calm,
  clean, cream, beige and sage, with bonsai and zen motifs.
- **Its own repo and its own Cloudflare Worker**, kept apart from Side Quest's.
- **Rewards go through Side Quest.** A finished 15-minute reading session counts
  as a pomodoro there.

## Core loop

1. **The feed.** Short-first cards: an abstract, an excerpt, a quote, a clip.
   Tap a card to open the full paper, essay, episode or chapter.
2. **Branches.** Topics are the tree's branches (Mind, Trans health, Queer
   history, Tech & society, Tao). Filter the feed by branch. Unfollowing is
   pruning.
3. **Books in the feed.** An uploaded EPUB is split into ~15-minute sessions.
   A "Continue reading" card shows up in the scroll, and tapping it opens a
   quiet reading mode that remembers your place.
4. **Leaves.** Highlight a line or write a one-line takeaway to save a leaf to
   that branch.
5. **Throwbacks, not quizzes.** Saved leaves come back later as quote cards.
   Nothing to answer, nothing graded. The spacing grows quietly in the
   background (about 3 days, 10 days, 1 month, 3 months, 6 months).
6. **Connections.** When a new card relates to a leaf you saved, it says so
   ("Connects to the ADHD paper you saved in March").
7. **Weekly recap.** The garden screen shows what you read and saved this
   week, plus what's about to resurface.

## Incentive: Side Quest

A finished 15-minute session writes a TickTick focus record through Side
Quest's existing worker (`POST /focus` on `aquamarine-data`, in the
`study-ledger` repo) with a note like *"🌱 Bonsai: Tao Te Ching, ch. 11–14."*
Side Quest already turns TickTick focus into tomatoes, streak days and bonus XP,
so Side Quest itself needs no change.

- Bonsai and Side Quest are both served from `https://atonioguy.github.io`, so
  that worker's `ALLOW_ORIGIN` accepts Bonsai either way.
- Bonsai stores the worker key on the phone only, entered once in settings.
  It is never committed.
- A session only counts if you actually read during it (time on the page plus
  scrolling). An optional "What stuck?" line at the end saves as a leaf.
- Reward depth (finishing a session, saving a leaf), never volume (cards
  scrolled).

## Feed mix

A mix dial, roughly 60% subscriptions, 25% discovery and 15% books and
throwbacks, adjustable later. After a run of short cards, a deeper one (a book
session or a full essay) appears. An optional "You're caught up" point lets the
scroll end when you want it to.

## Architecture

| Piece | Where | Notes |
|------|------|------|
| App (HTML/CSS/JS, PWA) | GitHub Pages, this repo | `atonioguy.github.io/bonsai`. No build step to start. |
| Feed worker `bonsai-feeds` | Cloudflare (free plan) | Fetches the feeds in `sources.json` on a schedule (cron), cleans them into cards, caches them in KV and serves JSON. Browsers can't fetch most feeds directly (CORS), so this is required. Holds no personal keys. |
| Books, leaves, reading progress | On the phone (IndexedDB) | Private. Books are **never** committed: the repo is public. |
| Side Quest bridge | Existing `aquamarine-data` worker | Only `POST /focus`. |

Later, optional: AI summaries for long pieces that have no abstract, a
cross-device backup of leaves (a KV slot like Side Quest's saves), and YouTube
channels (they publish RSS feeds).

## Sources

See [`sources.json`](sources.json). Every URL there is **unverified**: they came
from search results or each site's usual feed pattern, and the design session
couldn't open them because of its network settings. The worker checks each one
on first fetch. Still to find: Garbage Day's current feed and Greater Good's
articles feed.

### PubMed searches (your homework)

PubMed turns any search into a feed. For each search below: open
pubmed.ncbi.nlm.nih.gov, paste the query and run it. Click **Create RSS** under
the search box, keep 15 items, click **Create RSS** again, then copy the link and
paste it into `sources.json` (or send it to Claude).

- Adult ADHD:
  `(ADHD[tiab] OR "attention deficit"[tiab]) AND adult*[tiab] AND (review[pt] OR free full text[sb])`
- Borderline personality:
  `"borderline personality"[tiab] AND (review[pt] OR "randomized controlled trial"[pt])`
- Depression and anxiety:
  `(depress*[tiab] OR anxiety[tiab]) AND "systematic review"[pt] AND free full text[sb]`
- Trans and gender-affirming care:
  `(transgender[tiab] OR "gender-affirming"[tiab] OR "gender diverse"[tiab]) AND free full text[sb]`

If a feed turns out too busy or too quiet, adjust its query.

## Look and feel

Calm and clean: cream paper, sand and beige cards, sage for anything alive
(buttons, links, foliage), warm dark-brown ink instead of black. The motifs are
a small bonsai mark, an ensō ring as the reading timer, and leaves for saved
takeaways.

| Token | Hex | Use |
|------|------|------|
| cream | `#F5F0E7` | Page background |
| paper | `#FBF8F2` | Cards, reading surface |
| sand | `#EADFCF` | Book session cards, tracks |
| beige | `#D8C6AE` | Media placeholders, input borders |
| nude | `#CFAE96` | Bonsai pot, warm accent |
| sage | `#A3B18A` | Foliage, progress fills |
| sage-soft | `#E4E8DA` | Throwback cards, highlights |
| sage-deep | `#56654A` | Buttons, links, active states |
| bark | `#6E5A47` | Tree trunk |
| ink | `#332D27` | Body text |
| ink-2 | `#6A5F54` | Secondary text (≥4.5:1 on cream) |
| line | `#E3D9CA` | Hairlines |

- **Type:** Newsreader for reading and headings (made for long reading on
  screens) and Karla for interface labels. Both are free Google Fonts.
- **Shape:** 20px card corners, pill buttons, 44px minimum tap targets.
- **Motion:** slow and soft, and none when the phone asks for reduced motion.

## Build order (first version)

1. App shell: feed, library, garden and settings; installable PWA; palette and
   type.
2. `bonsai-feeds` worker: fetch `sources.json` feeds on a schedule, normalize
   them to cards, serve `/feed`.
3. Feed screen: cards, branch filter, open the full item.
4. Books: EPUB upload, split into sessions, reading mode with the ensō timer.
5. Leaves and throwbacks: highlight to save, resurfacing schedule, throwback
   cards.
6. Side Quest bridge: a finished session writes the TickTick focus record.
7. Garden screen: the tree by branch, weekly recap, "Resurfacing soon."

## Open questions

- Should the feed have a daily "You're caught up" point by default, or only
  when you turn it on?
- Dark mode for night reading: warm charcoal with sage?
- Should the garden tree grow visibly with leaves (more foliage per branch)?
