# Anime Progress Tracker

Firefox extension that tracks anime watching progress. Feature-parity with Manga Progress Tracker, plus MyAnimeList XML import/export.

## Features

- Auto-detect title, episode, and cover
- Statuses: watching / hold / dropped / finished / plan to watch
- Favorites, tags, search/sort/filters
- Merge duplicates, bulk delete, conflict-aware Gist sync
- Dark mode, badge, optional daily auto-sync
- JSON backup + **MAL `animelist_*.xml` import/export**

## MAL import

1. Export your list from MyAnimeList (XML)
2. Popup → Settings → **Import MAL XML** (or paste XML and Import)
3. Entries merge by title (episodes/tags kept)

Export writes MAL-compatible XML you can re-import on MAL (set `update_on_import`).

## Gist sync

Use a **separate** Gist from Manga Tracker (`anime-tracker-backup.json`).
