# Reel Taste

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
Note: data is per-browser. Sync across devices would need a backend (e.g. Vercel KV/Postgres) and sign-in; that's the natural next step.
