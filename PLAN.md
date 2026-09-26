# Bonsai — plan

A calm feed for learning. It keeps what's good about Reddit and Twitter (short
cards, an endless scroll, something new every time) but fills the feed with
research, essays, history, audio and your own books. The scroll should leave you
knowing more instead of feeling worse.

Status: **v0.1 built, not deployed yet.** Steps 1–7 of the build order below
are in the code and pass the tests. Going live needs two owner steps (see
"Going live"). The first design canvas is at
https://claude.ai/artifact/LMQpZUb8NpK9yZCU77PUkx (private to the owner). The
built app follows `DESIGN.md`, which supersedes that mockup's rounder cards and
branded copy.

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
2. **Topics.** Mind, Trans health, Queer history, Tech & society and Tao.
   Filter the feed by topic, and switch sources off in Library. On the Saved
   screen each topic is a branch of the bonsai, but UI copy stays plain (see
   DESIGN.md §2).
3. **Books in the feed.** An uploaded EPUB is split into ~15-minute sessions.
   A "Continue reading" card shows up in the scroll, and tapping it opens a
   quiet reading mode that remembers your place.
4. **Saved quotes.** Select text in an article or book and tap **Save quote**.
   You can also add a one-line takeaway after a session.
5. **Throwbacks, not quizzes.** Saved leaves come back later as quote cards.
   Nothing to answer, nothing graded. The spacing grows quietly in the
   background (about 3 days, 10 days, 1 month, 3 months, 6 months).
6. **Connections (later).** When a new card relates to a quote you saved, it
   says so ("Related to a quote you saved in March").
7. **Weekly recap.** The Saved screen shows the tree, counts by topic, and this
   week's minutes, sessions and saves.

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
- The session clock only runs while the page is open and you've touched,
  scrolled or typed in the last 90 seconds. An optional takeaway at the end is
  saved as a note.
- Only finished sessions are logged, and the record covers the minutes actually
  read. If Side Quest can't be reached, Bonsai retries the next time it opens.
- Reward depth (finishing a session, saving a quote), never volume (cards
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
| Feed worker `bonsai-feeds` | Cloudflare (free plan) | Every 5 minutes refreshes the sources from `sources.json` that are over 2 h old, within a size budget (free-plan CPU and KV limits), stores cards in KV and serves `/feed`. Drops paywalled posts for sources marked `hideLocked`. Browsers can't fetch most feeds directly (CORS), so this is required. Holds no personal keys. |
| Books, leaves, reading progress | On the phone (IndexedDB) | Private. Books are **never** committed: the repo is public. |
| Side Quest bridge | Existing `aquamarine-data` worker | Only `POST /focus`. |

Later, optional: AI summaries for long pieces that have no abstract, a
cross-device backup of leaves (a KV slot like Side Quest's saves), and YouTube
channels (they publish RSS feeds).

## Sources

See [`sources.json`](sources.json). Every URL there is **unverified**: they came
from search results or each site's usual feed pattern, and the design session
couldn't open them because of its network settings. The worker checks each one
when it fetches them. Garbage Day is marked `hideLocked`: posts that read as
"for paid subscribers" are dropped and free ones are kept (the worker counts
hidden posts per source).

### PubMed searches (done: the four feeds are in sources.json)

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

1. ✅ App shell: Feed, Library, Saved and Settings; installable PWA; tokens.
2. ✅ `bonsai-feeds` worker: fetches `sources.json` feeds every 2 h and
   serves `/feed`.
3. ✅ Feed: entries, topic filter, article view, "Open original", audio player.
4. ✅ Books: EPUB upload, reader with the ensō session timer, progress saved.
5. ✅ Saved quotes and throwbacks: select to save, resurfacing schedule.
6. ✅ Side Quest bridge: a finished session writes a TickTick focus record.
7. ✅ Saved screen: the tree by topic and the weekly recap.
8. ✅ Dark mode (v0.2): Settings → Appearance (Match phone / Light / Dark).
9. ✅ Two ways to read (v0.3): the book card offers a **timed session** (5, 15
   or 25 min, the choice is remembered; it only counts if finished and goes to
   Side Quest as a pomodoro record) or a **free read** (counts all active time
   and goes to Side Quest as a stopwatch record when you tap Done or leave).
   Side Quest's rules: a pomodoro of ≥5 min = 1 tomato; stopwatch = 1 tomato
   per 25 min with the remainder carried; anything under 5 min is ignored, so
   free reads under 5 min stay local. A free read cut off by closing the app is
   finished and sent the next time Bonsai opens.
10. ✅ v0.4: hairlines between posts; opened posts dimmed + "Opened"; per-topic
    new counts, a "N new articles" button and an "Earlier" line; Recently
    opened drawer; article toolbar (Aa text size + light/dark, share,
    reading list, bookmark into folders); reading position kept per
    article; screen transitions; private reactions and notes with a profile
    avatar; Collections tab (Reading list, Bookmarks with Folders, Quotes);
    the Bonsai tab (a tree that grows with your activity, plus stats);
    **Load full article** for research papers via Europe PMC's open-access
    copy, falling back to "Open in browser" and your library's LibKey link
    (Settings → Library access).
11. ✅ v0.5: new topics (Health, Science, History, News, Nearby); **Today's
    brief** (5 stories a day from The Conversation, ProPublica, The 19th, NPR,
    BBC World, Tangle, always one good-news story from Reasons to be
    Cheerful, Positive News or Fix the News; News stays out of the main feed
    unless Settings → News in the main feed is on); **YouTube channels** as
    video/Short cards played in the app (`youtube:@handle` sources, resolved
    by the worker); Dallas Voice in Nearby. Worker now runs every 2 minutes.

12. ✅ v0.6: long-press (touch) or right-click (mouse) on any post opens a
    preview with actions: reading list, bookmark (folders), mark read/unread,
    share, hide (hidden posts collapse to a line with Show); a movable jump
    button (to the bottom, then back to top; drag it anywhere, it remembers);
    the Reading list as its own feed tab, and Collections lists use the same
    post cards. Review fixes: stray "null" text (Bookmarks, Settings) blocked
    for good; avatar selection ring centered; Profile/Appearance spacing;
    bookmark sheet hint; Library sources fold by topic and show problems;
    no switch on sources without a feed; a duplicate "open" button on failed
    full text; a tap after a long-press no longer gets swallowed.

13. ✅ v0.6.1: the feed server refreshes everything that's due each run (within
    a budget) instead of one source, so it fills in minutes; `/health` shows
    whether it's running; the app nudges it while open if sources are missing,
    and Library warns (with the fix) when its schedule has stopped.
    v0.6.2: schedule every 5 minutes, not 2, to stay well under the free
    plan's 1,000 KV lists a day.

Local (circle back): City of Arlington and KERA need their feed links; LGBTQ
calendars found but none with a confirmed feed yet (HELP Center for LGBT
Health & Wellness, Equality Arlington, UTA LGBTQ+ Program on events.uta.edu,
1851 Club, Resource Center Dallas, Dallas Voice's weekly events). A weekly
"This week near you" card needs calendar (iCal) support in the worker.
Also planned with it: a **Calendar** button next to Recently opened (the clock)
that opens one calendar showing every events calendar's events in one place.

Next:
- Connections between new items and saved quotes.
- A cross-device backup of saved quotes (right now: Export/Import in Settings).
- An optional "You're caught up" daily stopping point.

## Going live (owner steps)

1. **Merge to `main` and turn on GitHub Pages:** repo **Settings → Pages →
   Build and deployment → Deploy from a branch → `main` / root**. The app
   appears at `https://atonioguy.github.io/bonsai/`.
2. **Deploy the feed worker** from the Cloudflare dashboard (no terminal):
   follow `worker/README.md` (about 10 min), then paste its URL into Bonsai →
   Settings → Feed server URL.
3. **Optional, Side Quest:** in Bonsai → Settings → Side Quest, paste the same
   worker URL and key that Side Quest's dashboard uses.
4. **On the phone:** open the site in Safari, then Share → **Add to Home
   Screen**.

## Open questions

- Should the feed have a daily "You're caught up" point by default, or only
  when you turn it on?
- Dark mode for night reading: warm charcoal with sage?
