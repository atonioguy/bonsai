# Bonsai — notes for Claude sessions

A calm, phone-first reading feed (PWA on GitHub Pages) plus a small Cloudflare
Worker that collects the feeds. Owner: a curious reader, not a developer. Explain
setup steps plainly.

## Read first

1. **`PLAN.md`**: what the app is, the decisions made, and what's built or next.
2. **`DESIGN.md`**: required before any UI or copy change. It overrides generic
   design defaults. Its §10 workflow (a note before building, screenshots and a
   removal pass after) applies to every screen.
3. `css/tokens.css`: the only source of colors, spacing, type, radii and
   motion.
4. **`HANDOFF.md`**: live state, what's unconfirmed on the phone, what's
   parked, and how the owner likes to work. Update it at the end of a session.

## Map

| Path | What |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | App entry, PWA install, offline cache |
| `js/app.js` | Boot, hash router, nav, shared `app` state, `VERSION` |
| `js/screens/*.js` | One module per screen: `render(main, app, ...params)` returns an optional cleanup |
| `js/logic.js` | Pure logic (feed mix, throwback schedule, formatting), unit-tested in Node |
| `js/db.js` | IndexedDB (settings, feed cache, books, progress, saved, sessions) |
| `js/books.js`, `js/epub.js` | EPUB import (zip read with `DecompressionStream`) and reading progress |
| `js/sanitize.js` | Allowlist HTML cleaner for feed and book content |
| `js/sidequest.js` | Logs finished sessions to Side Quest's worker (`POST /focus`) |
| `js/posts.js` | Per-article state on the device: snapshot, opened, scroll, bookmark + folders, reading list, reaction, notes; opened/seen indexes |
| `js/prefs.js` | Theme + reading text size (localStorage, applied before paint by `index.html`) |
| `js/fulltext.js` | Europe PMC lookup + JATS → HTML for "Load full article" |
| `js/readtools.js`, `js/recent.js` | The Aa popover; the Recently opened drawer |
| `js/entries.js`, `js/postmenu.js`, `js/bookmark.js` | Post cards (feed, reading list, folders); long-press/right-click preview + actions; the bookmark folder sheet |
| `js/jump.js` | The movable jump-to-bottom / back-to-top button |
| `js/swipe.js` | Swipe a feed post left for the Reading list / Hide buttons |
| `worker/` | `bonsai-feeds` Cloudflare Worker. Edit `worker.js`/`parse.js`, then `node worker/build.mjs` regenerates `bonsai-feeds.js`, the single file the owner pastes into the Cloudflare dashboard |
| `sources.json` | Topics, sources (feed URLs) and suggested free books. Read by both the app and the worker |
| `test/` | `node --test test/*.test.mjs` (unit), `node test/ui.mjs` (browser run + screenshots) |

## Rules

- No build step and no npm dependencies in the app. Plain ES modules.
- Personal data stays on the device (IndexedDB). Never commit books, keys or
  exported backups. The repo is public.
- The feed worker holds no secrets. The Side Quest key is typed into Settings
  on the phone and is never written to a file.
- Every feed or book HTML string goes through `sanitize()` before `innerHTML`.
- Use only tokens from `css/tokens.css`. A new value goes into the token file
  and DESIGN.md first.
- Use the product vocabulary in DESIGN.md §2. Don't use garden, leaf, branch,
  tend or grow in UI copy.

## Checks before pushing

```bash
node --test test/*.test.mjs     # parser + logic
node test/ui.mjs                # full app in Chromium, 375 and 1280 wide → test/shots/
```

Then look at the screenshots (DESIGN.md §10). `REVIEW=1 node test/ui.mjs` takes
full-page screenshots for a layout review. Every screenshot is also checked for
horizontal overflow and stray "null"/"undefined"/"NaN" text.

## Shipping a change

- Bump `VERSION` in `js/app.js` and `CACHE` in `sw.js` together, or phones keep
  the old files.
- Add any new app file to the `SHELL` list in `sw.js`.
- The live site serves `main` via GitHub Pages at
  `https://atonioguy.github.io/bonsai/`.
- Worker changes: run `node worker/build.mjs`, then tell the owner to re-paste
  `worker/bonsai-feeds.js` in the Cloudflare dashboard (Edit code → Deploy). That's
  how they deploy; they don't use a terminal. `sources.json` edits need no redeploy.
- The free Workers plan allows ~10 ms of CPU per run and 1,000 KV writes a day.
  That's why each 5-minute cron run refreshes only sources that are due (over 2 h
  old) within a 300 KB parse budget, and `/feed` stitches stored text instead of
  parsing it. Keep it that way. Every run also does one KV list (1,000 a day
  allowed), so don't schedule it more often than every 5 minutes.

## Related repo

`atonioguy/study-ledger` holds Side Quest and its `aquamarine-data` worker. Bonsai
only calls that worker's `POST /focus` (body `{ startTime, endTime, type: 0,
taskId: null, note }`, header `x-aq-key`). Don't change that repo from here.
