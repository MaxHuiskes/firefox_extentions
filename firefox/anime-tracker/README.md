# Anime Progress Tracker

A Firefox extension that detects anime titles and episode numbers, saves watching progress, and lets you edit or remove entries from the extension popup.

## How it works

- `content.js` reads the anime title and episode from the current page.
- Progress is stored in Firefox local extension storage.
- `popup.html` displays and edits the saved anime list.
- The options page limits tracking to specified domains. An empty list allows all sites.

Data is local to each Firefox installation; it is not currently synchronized between desktop and Android.

## Load temporarily (desktop)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` in this folder

## Usage

1. Open the extension settings and optionally enter allowed domains separated by commas.
2. Visit an anime episode page.
3. The extension detects and saves the title, episode, and URL.
4. Open the extension popup to view, edit, delete, or reopen saved entries.
