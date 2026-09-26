# bonsai-feeds (Cloudflare Worker)

Reads the feeds listed in `../sources.json`, turns them into cards, and serves
them to the app. It runs on its own, separate from Side Quest's
`aquamarine-data` worker, and holds no keys or passwords. It only reads public
feeds.

**How it works:** every 2 minutes it refreshes the one source that has waited
longest, so each run stays inside the free plan’s CPU limit. With about 50
sources, each one is refreshed roughly every 2 hours. `GET /feed` returns
everything stored.

## Deploy from the Cloudflare dashboard (no terminal, ~10 min)

Before you start, GitHub Pages must be on: the worker reads
`https://atonioguy.github.io/bonsai/sources.json`.

1. **Create the worker.** On dash.cloudflare.com, open **Workers & Pages** →
   **Create** → **Create Worker** (the "Hello World" starter). Name it
   `bonsai-feeds` and click **Deploy**.
2. **Paste the code.** Click **Edit code**. Delete everything in the editor,
   paste the whole of
   [`bonsai-feeds.js`](https://raw.githubusercontent.com/atonioguy/bonsai/main/worker/bonsai-feeds.js)
   (open the link, select all, copy), then click **Deploy**.
3. **Make the storage.** In the left sidebar go to **Storage & Databases → KV**,
   click **Create** (or "Create namespace"), and name it `bonsai-feeds`.
4. **Connect the storage.** Open the `bonsai-feeds` worker → **Bindings** tab
   (in some layouts it's **Settings → Bindings**) → **Add binding** → **KV
   namespace**. Set **Variable name** to exactly `FEEDS`, pick the `bonsai-feeds`
   namespace, and save or deploy.
5. **Schedule it.** In the worker go to **Settings → Trigger Events** (sometimes
   called **Triggers**) → **Add** → **Cron Triggers**. Enter `*/2 * * * *`
   (every 2 minutes) and save.
6. **Check it.** Open `https://bonsai-feeds.<your-subdomain>.workers.dev/feed`.
   It's the same subdomain your aquamarine-data worker uses, and the URL is
   shown on the worker's page. You should see text starting `{"updatedAt"`
   with one source in it. The rest fill in over the next ~2 hours.
7. **Connect the app.** Bonsai → **Settings** → **Feed server URL**, paste
   `https://bonsai-feeds.<your-subdomain>.workers.dev` and tap **Save**.

No variables are needed. The worker defaults to the live `sources.json` and
only answers requests from `https://atonioguy.github.io`.

### Updating the worker later

When `bonsai-feeds.js` changes, repeat step 2 (Edit code → paste → Deploy).
Bindings and the schedule stay as they are. Editing `sources.json` never needs
a redeploy: once it's on `main`, the worker picks it up within a few minutes.

## Deploy with wrangler (alternative)

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create FEEDS   # paste the printed id into wrangler.toml
npx wrangler deploy
```

## Endpoints

- `GET /feed` → `{ updatedAt, sources: [{ id, meta: { fetchedAt, ok, count, hidden, error }, items: [...] }] }`
- `POST /refresh` → refreshes the next source now (at most once a minute)
- `GET /epmc?path=…` → relays Europe PMC's search and `PMCxxxx/fullTextXML` (the app
  tries Europe PMC directly first; this is the fallback). Other paths are refused.
- `GET /health` → `{ ok: true }`

`meta.hidden` counts posts dropped as paywalled (sources with `"hideLocked":
true`). `meta.error` explains a failing feed, and the app's Library screen
marks that source "Not loading".

## For developers

`worker.js` and `parse.js` are the source files. After editing either one, run
`node worker/build.mjs` to regenerate `bonsai-feeds.js`, the single file for
the dashboard. A test fails if you forget.
