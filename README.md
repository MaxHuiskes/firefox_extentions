# firefox_extentions

Self-made browser themes and extensions for **Firefox** and **Brave**.

## Contents

| Path | Type | Browser | Description |
|------|------|---------|-------------|
| [`firefox/manga-tracker/`](firefox/manga-tracker/) | Extension | Firefox | Tracks manga title/chapter; edit/remove from popup. |
| [`firefox/anime-tracker/`](firefox/anime-tracker/) | Extension | Firefox | Tracks anime title/episode; edit/remove from popup. |
| [`brave/manga-tracker/`](brave/manga-tracker/) | Extension | Brave | Same feature set, Chromium MV3 / `chrome.*` APIs. |
| [`firefox/time_killer/tetris arcade/`](firefox/time_killer/tetris%20arcade/) | Extension | Firefox | Arcade Tetris from the browser action popup. |
| [`firefox/oranje rood/`](firefox/oranje%20rood/) | Theme | Firefox | Dark theme with flame header and orange text. |
| [`firefox/releases/`](firefox/releases/) | Packages | Firefox | Built/signed release zips. |

## Load temporarily

### Firefox (desktop)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` inside the extension or theme folder

### Brave (desktop)

1. Open `brave://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the extension folder (e.g. `brave/manga-tracker`)

Firefox themes (`theme` in `manifest.json`) do not load in Brave.

## Notes

- Spelling in the repo name is intentional (`extentions`).
- Manga tracker `storage.sync` syncs desktop ↔ desktop only. Firefox Android does not sync extension storage to the account.
- Brave store is separate from Firefox.
