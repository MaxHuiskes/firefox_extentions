# Anime Progress Tracker

Firefox extension that tracks anime watching progress with statuses, covers, search/sort, and optional GitHub Gist sync (desktop ↔ Android).

## Features

- Auto-detect title, episode, and cover (`og:image`) on supported sites
- Statuses: watching / hold / dropped / finished
- Search, sort, site filter, bulk delete with confirm
- Next episode link when URL pattern allows
- Ignore sites, dark mode, badge for recent updates
- Manual Gist sync (pull → push) + optional daily auto-sync
- Export / import JSON backup

## Load temporarily (desktop)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` in this folder

## Gist sync

1. Create a classic GitHub token with **gist** scope
2. Options → paste token → Sync now
3. Copy Gist ID to the other device → same token → Sync now

Use a **separate** Gist from Manga Tracker (different filename: `anime-tracker-backup.json`).
