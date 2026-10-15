# firefox_extentions

Self-made browser themes and extensions for **Firefox** and **Brave**.

## Contents

| Path | Type | Browsers | Description |
|------|------|----------|-------------|
| [`manga-tracker/`](manga-tracker/) | Extension | Firefox, Brave | Tracks manga title/chapter on page visit; edit or remove entries from the popup. See [manga-tracker/README.md](manga-tracker/README.md). |
| [`time_killer/tetris arcade/`](time_killer/tetris%20arcade/) | Extension | Firefox, Brave | Arcade Tetris playable from the browser action popup. |
| [`oranje rood/`](oranje%20rood/) | Theme | Firefox | Dark theme with flame header and orange text. |
| [`releases/`](releases/) | Packages | — | Built/signed release zips (e.g. manga-tracker V1.0.0). |

## Load temporarily

### Firefox (desktop)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` inside the extension or theme folder

### Brave (desktop)

1. Open `brave://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the extension folder (the one that contains `manifest.json`)

Firefox themes (`theme` in `manifest.json`) do not load in Brave. Use Chromium/Brave theme packs separately if needed.

## Notes

- Spelling in the repo name is intentional (`extentions`).
- Manga tracker data is local per browser install (not synced).
- Brave uses Chromium Manifest V3; Firefox-specific `browser_specific_settings.gecko` is ignored there.
