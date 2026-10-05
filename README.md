# Eastman

A personal movie site: import what you've watched, rank it Beli-style, and get recommendations tuned to your taste and your mood.

## What it does
- **Import** your Letterboxd export (`ratings.csv`, `watched.csv`, `diary.csv`), a Netflix viewing-activity CSV, any CSV with a `Title`/`Name` column, or add films by hand.
- **Rank Beli-style**: gut reaction (loved / liked / didn't like), then head-to-head "which did you like more?" duels using binary search (~log2 N duels per film). Scores (1–10) come from list position. "Quick-place" seeds from your star ratings; "Refine a close call" re-compares neighbors.
- **Recommend** from your taste profile (genres, directors, decades, weighted around *your* average) plus TMDB "similar to films you loved". Pick a **mood** (cozy, mind-bending, short & sweet…) to steer it. Each pick says why. "Seen it" immediately asks what you thought.
- **Where to stream**: TMDB watch-provider data, filtered to your region and services.

## Honest limits
- Letterboxd has no public API: you re-export your data from Letterboxd settings when you want to refresh it.
- Most streaming services (Netflix aside) offer no history export or API.
- Without a TMDB key the app runs in demo mode on a small built-in catalog.

## Run
```
npm start        # http://localhost:5173
npm test         # ranking, import and recommendation logic
```
No build step or dependencies. All data lives in your browser's localStorage; your TMDB key never leaves your browser except in requests to TMDB.

## Deploy to Vercel
Import the repo in Vercel (framework: Other, no build command). `vercel.json` serves the repo root as a static site.

### Sync across devices (phone, laptop…)
Your library lives in a Redis database behind `/api/state`, protected by one passphrase.
1. Vercel project → **Storage** → create/connect **Upstash Redis** (Marketplace). This adds the `KV_REST_API_*` / `UPSTASH_REDIS_REST_*` env vars.
2. **Settings → Environment Variables**, add:
   - `SYNC_PASSWORD`: a passphrase you choose (the API refuses to run without it)
   - `TMDB_API_KEY`: optional; keeps your TMDB key on the server so devices don't need it
3. Redeploy. On each device: **Settings** → enter the passphrase → Save.
The app pulls on load and when you return to the tab, and pushes shortly after each change. If two devices edited, they're merged (nothing added is lost; the more recent device wins ordering). Device-local: passphrase and TMDB key.
