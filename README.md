<p align="center">
  <img src="logo.svg" width="96" alt="PlayFetch logo">
</p>

# PlayFetch

Browser extension for **Chrome** and **Firefox** that, with one click on the toolbar icon, finds the **direct .mp4 link** of the video you are watching, **copies it to the clipboard** and **opens it in a new tab**.

Supported sites:

- **HypnoTube** (`hypnotube.com/video/...`)
- **RedGifs** (single pages `redgifs.com/watch/...` and feeds)

## How it works

- **HypnoTube**: the player uses a plain `<video><source src="...mp4">`, so the link is read straight from the page.
- **RedGifs**: the player uses a `blob:` URL (the video is assembled in memory), so the page contains no mp4 link. The extension finds the video **id** (from the `/watch/<id>` URL or, in feeds, from the poster/thumbnail and links near the video) and asks the RedGifs API for the mp4 link (HD, or SD if HD is missing). As a fallback it also records the `.mp4` requests made by the tab.

## Installation

Download `playfetch-<browser>-<version>.zip` from the [latest release](../../releases/latest) and extract it. In the steps below, select the folder that directly contains `manifest.json`.

### Chrome

1. Open `chrome://extensions/` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the folder from `playfetch-chrome-<version>.zip`.

### Firefox (121 or later)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select the `manifest.json` file from `playfetch-firefox-<version>.zip`.

Firefox removes temporary add-ons when it is closed, so repeat the steps after a restart. Site access may also not be granted automatically in Manifest V3: if the icon does nothing, open `about:addons` → PlayFetch → **Permissions** and allow access to hypnotube.com and redgifs.com.

### From source

```bash
python build.py
```

This creates `dist/chrome/`, `dist/firefox/` and the corresponding zip files, with a manifest tailored to each browser (Chrome: `service_worker` only; Firefox: `scripts` only — loading the repository folder itself works too, but Chrome then shows a harmless warning about the unused Manifest V2 `scripts` key).

## Usage

1. Open a video on HypnoTube or RedGifs. If the page was already open before you installed or reloaded the extension, **reload it** (F5).
2. In a RedGifs feed, scroll to the video you want.
3. Click the extension icon to open the popup, turn on the actions you want (**open in a new tab**, **copy the link**, **download**) and press **Run**. The popup remembers your last choice.

If something goes wrong, the popup shows a short message instead of running the action (for example "Reload the page, then try again" if the content script is missing from the tab, or "Could not identify this video" for a RedGifs feed where the id could not be found).

## Permissions

| Permission | Why |
|---|---|
| `clipboardWrite` | Copy the link to the clipboard |
| `storage` | Store the temporary RedGifs API token, the `.mp4` requests observed and your popup choices |
| `webRequest` | Observe `.mp4` requests (fallback for RedGifs) |
| `downloads` | Start the download when that option is on |
| Access to `hypnotube.com` and `*.redgifs.com` | Read the page and call the RedGifs API |

## Privacy

The extension has no server of its own and does not collect or send data to its author. On RedGifs it only contacts `api.redgifs.com`, sending the id of the video you are viewing to get its link. The temporary API token it needs is stored locally in the browser and reused for about 20 hours, to stay within the API's rate limits.

## Known limitations

- RedGifs links are **signed and tied to IP address and user agent** and, according to the API documentation, expire after roughly 30-60 minutes: they work from your browser, but not if pasted on another device or handed to a server.
- In RedGifs feeds the video id is found heuristically (poster, images and links inside the video's container), so it may stop working if the site changes its markup.
- On HypnoTube the CSS selector depends on the site's layout.
- Personal project, not affiliated with HypnoTube or RedGifs. Use it in accordance with the sites' terms of service and with copyright.

## Development

- `manifest.json`: development manifest (lists both `service_worker` and `scripts`, so the repository folder itself loads unpacked in either browser).
- `background.js`: resolves the video link (DOM, RedGifs API, request sniffing) and runs the actions chosen in the popup.
- `content.js`: link/id extraction from the page and clipboard copy.
- `popup.html`, `popup.js`: the toolbar popup (the three switches and the Run button).
- `icon.png`, `logo.svg`: extension icon and its vector source.
- `build.py`: builds the per-browser packages into `dist/`.
- `.github/workflows/release.yml`: on every `v*` tag, builds the packages and attaches them to a GitHub release.

### Releasing

1. Bump `version` in `manifest.json`.
2. Tag and push: `git tag v<version> && git push --tags` (the tag must match the manifest version).

## TODO

- Remember the last used link per tab, to avoid re-resolving it if you press Run again

## License

[MIT](LICENSE)
