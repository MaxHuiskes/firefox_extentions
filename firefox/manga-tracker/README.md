# Manga Progress Tracker

A Firefox extension that detects manga titles and chapter numbers, saves reading progress, and lets you edit or remove entries from the extension popup.

## How it works

- `content.js` reads the manga title and chapter from the current page.
- Progress is stored in `browser.storage.sync` (with a local mirror).
- `popup.html` displays and edits the saved manga list.
- The options page limits tracking to specified domains. An empty list allows all sites.

Desktop ↔ desktop sync works via `browser.storage.sync` (same Firefox Account, Add-ons sync enabled, signed add-on).

**Desktop ↔ Android does not.** Firefox for Android exposes `storage.sync` but does not upload/download it through Mozilla accounts ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync), [bug 1625257](https://bugzilla.mozilla.org/show_bug.cgi?id=1625257)). AMO approval does not change this.

Use **Settings → GitHub Gist sync** (each user uses their own token) or **Export / Import**. Vote on [bug 1625257](https://bugzilla.mozilla.org/show_bug.cgi?id=1625257) for built-in Firefox mobile sync.

## GitHub Gist sync (recommended)

No Google Cloud / OAuth. Each user needs a free GitHub account.

1. Open [github.com/settings/tokens](https://github.com/settings/tokens)
2. **Generate new token (classic)** → enable only **gist** → Generate
3. Extension **Settings** → paste token → **Save token / Gist ID** → **Sync now**
4. Copy the shown **Gist ID**
5. On the other device: paste the **same token** and **same Gist ID** → **Sync now**

Creates a **secret** gist (`manga-tracker-backup.json`). Free. Works on desktop and Android.

Gist sync is **manual only**: use **Settings → Sync now (pull → push)** on each device when you want to exchange progress.

## Test on Firefox for Android

### Requirements

- Firefox for Android installed on the phone
- Android Platform Tools (`adb`) installed on the computer
- Node.js and `web-ext` installed:

```sh
npm install --global web-ext
```

### Prepare the phone

1. Enable Android **Developer options** and **USB debugging**.
2. Connect the phone by USB.
3. Accept the USB debugging prompt on the phone.
4. Confirm that the device is available:

```sh
adb devices
```

The device must be listed as `device`, not `unauthorized`.

### Run the extension

Run the command from this extension's directory:

```sh
cd /Users/max/Desktop/firefox_extentions/firefox/manga-tracker
web-ext lint
web-ext run --target=firefox-android --android-device={device id}
```

Keep the command running while testing. This is a temporary development installation and Firefox removes it when the debugging session ends.

## Create an Android install package

Validate and build the extension:

```sh
cd /Users/max/Desktop/firefox_extentions/firefox/manga-tracker
web-ext lint
web-ext build
```

The package is written to `web-ext-artifacts/`. Firefox release versions require an extension signed by Mozilla. Submit the package through [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/) as either:

- **Listed**: published publicly on Firefox Add-ons.
- **Unlisted**: signed by Mozilla for private distribution.

After Mozilla signs it, install the signed add-on on Android. An unsigned package is only suitable for temporary debugging with `web-ext run`.

## Usage

1. Open the extension settings and optionally enter allowed domains separated by commas.
2. Visit a manga chapter page.
3. The extension detects and saves the title, chapter, and URL.
4. Open the extension popup to view, edit, delete, or reopen saved entries.
