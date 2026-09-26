# Handoff

Where things stand, for the next Claude session. Read this after CLAUDE.md. For
the full history and the parked ideas, see PLAN.md (build log items 1–14 and
the "Local (circle back)" / "Next" notes).

## Live state (v0.6.3)

- App: https://atonioguy.github.io/bonsai/, served from `main`.
- The feed worker `bonsai-feeds` is deployed from the Cloudflare dashboard, and
  its Cron Trigger is running (the owner confirmed sources now load on their
  own). The cron is `*/5 * * * *` (the owner confirmed the change from
  `*/2`, made to stay under the KV list limit). `/health` shows whether it's
  running.
- The deployed worker code matches `worker/bonsai-feeds.js` as of v0.6.1. Later
  versions changed only a comment in it, so no re-paste is needed.

## Not yet confirmed on the owner's phone

- Swipe left on a feed post (Reading list / Hide buttons), v0.6.3.
- Holding a post no longer selects text (iOS), v0.6.3.
- "Load full article" via Europe PMC: never confirmed working live.

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
