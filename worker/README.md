# bonsai-feeds (Cloudflare Worker)

Reads the feeds listed in `../sources.json`, turns them into cards, and serves
them to the app. It runs on its own, separate from Side Quest's
`aquamarine-data` worker, and holds no keys or passwords. It only reads public
feeds.

## One-time setup (~10 min)

From this `worker/` folder:

```bash
npm install -g wrangler                 # if you don't have it
wrangler login                          # opens Cloudflare in your browser
wrangler kv namespace create FEEDS      # prints:  id = "abc123…"
```

Paste that id into `wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`), then:

```bash
wrangler deploy
```

Wrangler prints the worker URL, e.g. `https://bonsai-feeds.<you>.workers.dev`.
Open Bonsai → **Settings** → **Feed server URL**, paste it, and tap **Save**.

The first `/feed` request builds the feed right away. After that it rebuilds
every 2 hours.

## Changing sources

Edit `sources.json` in the repo. Once it's on `main`, the live site serves it
and the worker picks it up on the next rebuild. No redeploy is needed.

## Endpoints

- `GET /feed` → `{ updatedAt, items: [...], status: [{ id, ok, count | error }] }`
- `POST /refresh` → rebuilds now (ignored if the last build is under 10 min old)
- `GET /health` → `{ ok: true }`

`status` shows which feeds failed and why. The app's Library screen marks
those sources "Not loading".
