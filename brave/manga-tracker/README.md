# Manga Progress Tracker (Brave)

Brave / Chromium port of the Firefox manga tracker. Detects manga titles and chapter numbers, saves reading progress, and lets you edit or remove entries from the popup.

## How it works

- `content.js` reads the manga title and chapter from the current page.
- Progress is stored in `chrome.storage.local`.
- `popup.html` displays and edits the saved manga list.
- The options page limits tracking to specified domains. An empty list allows all sites.

Data is local to each Brave profile; it is not synced with the Firefox version.

## Differences from the Firefox build

- Uses Chromium MV3 `service_worker` instead of `background.scripts`.
- Uses the `chrome.*` API instead of `browser.*`.
- No `browser_specific_settings.gecko` block.
- Popup, options, and content scripts all use `storage.local` (same store).

## Load in Brave

1. Open `brave://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `brave/manga-tracker`

## Usage

1. Open the extension settings and optionally enter allowed domains separated by commas.
2. Visit a manga chapter page.
3. The extension detects and saves the title, chapter, and URL.
4. Open the extension popup to view, edit, delete, or reopen saved entries.
