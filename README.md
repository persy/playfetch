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

Download or clone this repository, so that you have a folder containing `manifest.json`.

### Chrome

1. Open `chrome://extensions/` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the folder.

### Firefox (121 or later)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select the `manifest.json` file.

Firefox removes temporary add-ons when it is closed, so repeat the steps after a restart. Site access may also not be granted automatically in Manifest V3: if the icon does nothing, open `about:addons` → PlayFetch → **Permissions** and allow access to hypnotube.com and redgifs.com.

## Usage

1. Open a video on HypnoTube or RedGifs. If the page was already open before you installed or reloaded the extension, **reload it** (F5).
2. In a RedGifs feed, scroll to the video you want.
3. Click the extension icon: the link is copied and opens in a new tab, where you can watch it or save it (right click → *Save video as*).

For three seconds the icon shows a badge with the outcome:

| Badge | Meaning |
|---|---|
| **OK** | Link copied and tab opened |
| **F5** | No content script in this tab: reload the page |
| **NOV** | No `<video>` found in the page |
| **NOID** | The video uses a `blob:` URL and its id could not be found (typical of some feeds) |
| **API** | The id was found, but the API request failed |
| **CLIP** | Link found, but copying to the clipboard failed (the tab still opens) |
| **N/A** | Unsupported site |

## Permissions

| Permission | Why |
|---|---|
| `clipboardWrite` | Copy the link to the clipboard |
| `storage` | Store the temporary RedGifs API token and the `.mp4` requests observed |
| `webRequest` | Observe `.mp4` requests (fallback for RedGifs) |
| Access to `hypnotube.com` and `*.redgifs.com` | Read the page and call the RedGifs API |

## Privacy

The extension has no server of its own and does not collect or send data to its author. On RedGifs it only contacts `api.redgifs.com`, sending the id of the video you are viewing to get its link. The temporary API token it needs is stored locally in the browser and reused for about 20 hours, to stay within the API's rate limits.

## Known limitations

- RedGifs links are **signed and tied to IP address and user agent** and, according to the API documentation, expire after roughly 30-60 minutes: they work from your browser, but not if pasted on another device or handed to a server.
- In RedGifs feeds the video id is found heuristically (poster, images and links inside the video's container), so it may stop working if the site changes its markup.
- On HypnoTube the CSS selector depends on the site's layout.
- Personal project, not affiliated with HypnoTube or RedGifs. Use it in accordance with the sites' terms of service and with copyright.

## Development

- `manifest.json`: extension manifest (it lists both `service_worker` and `scripts` so the same folder loads in Chrome and Firefox).
- `background.js`: toolbar click, badge, RedGifs API, request sniffing.
- `content.js`: link/id extraction from the page and clipboard copy.
- `icon.png`, `logo.svg`: extension icon and its vector source.

## TODO

- Popup options: copy only / open only / both
- Direct video download

## License

[MIT](LICENSE)
