# Handoff

Where things stand, for the next Claude session. Read this after CLAUDE.md. For
the full history and the parked ideas, see PLAN.md (build log items 1–14 and
the "Local (circle back)" / "Next" notes).

## Live state (v0.7.1)

- App: https://atonioguy.github.io/bonsai/, served from `main`.
- The feed worker `bonsai-feeds` is deployed from the Cloudflare dashboard, and
  its Cron Trigger is running (the owner confirmed sources now load on their
  own). The cron is `*/5 * * * *` (the owner confirmed the change from
  `*/2`, made to stay under the KV list limit). `/health` shows whether it's
  running.
- **Worker re-paste needed (v0.7.1):** `worker/bonsai-feeds.js` adds
  `GET /length?v=ID`. Until the owner re-pastes it (Edit code → Deploy),
  videos show no length. Everything else works without it. The owner said
  they hadn't re-pasted the v0.7.0 worker either, which is why no lengths
  showed. The v0.7.0 approach (a cron lookup stored in KV) was replaced.

## How the feed works now (v0.7.x)

- The feed keeps a saved order per tab plus the post at the top of the screen
  (IndexedDB `kv/feedView`). It survives screen changes and app restarts.
  New posts come in only by pulling down at the top (a new order, new posts
  first, every tab rebuilt) or by tapping Refresh at the end (new posts
  appended below a "New" line). Background checks only update the cache and
  the status line at the end.
- Duplicates (same PubMed id, DOI in the link, YouTube id, or cleaned link)
  merge in `mergeDuplicates` (js/logic.js). The kept id is the smallest, and
  the others are kept in `dupIds`.
- Tags come from `postTags`: a source's `tags` in sources.json, else its topic
  name, then Article/Video/Short/Podcast.
- Video lengths: js/lengths.js asks the worker's `/length` for videos on
  screen, 2 at a time, and keeps the answers in IndexedDB `kv/lengths`. A
  miss is asked again after a day. `/length?v=ID&debug=1` shows what YouTube
  answered (watch page, then the player API).
- Shorts use one shared YouTube IFrame API player that sits over the Short on
  screen (js/shorts.js). It's one player so the sound can stay on on iPhone.

## Not yet confirmed on the owner's phone

- Owner confirmed (v0.7.0): Shorts autoplay works. v0.7.1 centers them.
- v0.7.0/0.7.1, the rest (the session couldn't reach YouTube, so the Short
  player and the length lookups were only tested with stand-ins):
  - the feed keeps your place when you open posts, switch screens or reopen
    the app
  - pull down at the top to refresh; Refresh at the end adds posts below
  - Shorts autoplay muted; the sound button; sound staying on for the next
    Short; back to muted after the app restarts; the Settings switch; tap to
    play with it off
  - video lengths on thumbnails and in the article (after the worker
    re-paste; they should appear within seconds of opening the feed)
  - tags, and the ADHD/BPD duplicate showing once with both tags
- Swipe left on a feed post (Reading list / Hide buttons), v0.6.3.
- Holding a post no longer selects text (iOS), v0.6.3.
- "Load full article" via Europe PMC: never confirmed working live.

## Known risks to check if something's off

- iPhone may refuse sound in the feed player after the app restarts until
  you tap the sound button once. If so, Bonsai falls back to muted and shows
  the sound as off. That's by design.
- If lengths don't appear after the re-paste, ask the owner to open
  `…workers.dev/length?v=abcDEFGHIJK&debug=1` (any long video's id) and
  paste what it shows. It names a consent page, a bot check, or what the
  player API answered.
- The book card's session lengths wrap to two lines at desktop width (seen
  in the 1280 screenshots; not changed this session).

## Working with the owner

- They're on their phone most of the time and don't use a terminal. Give
  dashboard steps in plain words, one action per step.
- "Park it" or "pin it" means note it in PLAN.md and don't build it. Only
  build parked items when they say so.
- Parked right now:
  - local and LGBTQ calendars, the weekly "near you" card and the Calendar
    button
  - the newsletter route to those calendars
  - Reddit, Bluesky and Mastodon
  - City of Arlington and KERA feed links
  - connections between posts
- No Texas news in the brief.
- Workflow used so far: develop on the session's branch, run both test
  commands, then push to that branch and fast-forward `main` (the owner
  approved merging to main).

## Session environment gotchas

- This project's cloud sessions block most websites, so feed URLs in
  sources.json were never opened from a session ("verified: false"). The
  worker's Library status is the real check.
- The UI test uses the globally installed Playwright
  (`/opt/node22/lib/node_modules/playwright`) and the preinstalled Chromium.
  `REVIEW=1 node test/ui.mjs` gives full-page screenshots in `test/shots/`.
- `atonioguy/study-ledger` (Side Quest) is a separate repo. Don't change it
  from here.
