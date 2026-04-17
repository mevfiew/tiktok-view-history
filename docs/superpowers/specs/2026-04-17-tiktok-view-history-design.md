# TikTok View History — Design

**Date:** 2026-04-17
**Status:** Approved, ready for implementation planning
**Owner:** mevfiew (mehdehaan13@gmail.com)

## Purpose

TikTok's browser experience has no native watch history. Videos you saw a minute ago are irretrievable once you swipe past them — the mobile app has a Watch History feature, the web does not. This extension mirrors the shipped *Instagram View History* extension for TikTok: it quietly logs every video the page loads into a local searchable archive, so the user can find that one clip again without fighting the algorithm or trusting a cloud service.

## Goals

- Automatically log every TikTok video the user encounters while browsing `tiktok.com`.
- Provide a popup UI to browse, search, filter, and delete the logged history.
- Keep everything local — `chrome.storage.local` only, zero outbound requests.
- Reuse as much of the Instagram View History architecture as possible to stay shippable in a single short session.
- Ship to the Chrome Web Store under the same "privacy-first view history" brand.

## Non-goals (v1.0.0)

- Per-zone capture toggles (FYP-only, Following-only, etc.) — add in v1.1 if users ask.
- Live-stream capture.
- Watch-time / play-event tracking — we log on load, not on playback.
- Syncing across devices.
- Mobile web support (we target `www.tiktok.com` desktop web).

## User experience

Install the extension, browse TikTok like normal. Pin the extension icon. Click it anytime to open a popup showing a grid of every video loaded in front of you, most-recent first. Search by creator name, caption text, sound, or hashtag. Filter by duration. Click a thumbnail to open the video in a new tab. Delete individual items or clear all. Export the full history as JSON.

## Capture trigger

Any video TikTok loads into the page (prefetched or actively watched) is logged. Matches the Instagram extension's "capture whatever the feed returns" philosophy. Over-capture is a known trade-off; it is fixable in a later release by adding a play-event or IntersectionObserver gate.

## Data model

Each history entry stores:

| Field | Type | Source |
|---|---|---|
| `videoId` | string | TikTok feed response |
| `url` | string | constructed `https://www.tiktok.com/@{creator}/video/{videoId}` |
| `thumbnailUrl` | string | feed response (cover image) |
| `caption` | string (≤500 chars) | feed response, truncated |
| `creatorUsername` | string | feed response |
| `creatorDisplayName` | string | feed response |
| `soundName` | string | feed response (music.title or similar) |
| `hashtags` | string[] | parsed from caption + response `textExtra` |
| `durationSec` | number | feed response |
| `viewedAt` | number (ms epoch) | capture moment |
| `sourceFeed` | string (optional) | `fyp` / `following` / `profile` / `search` — if derivable from the endpoint URL |

## Architecture

Mirror the Instagram View History structure.

```
manifest.json            MV3 manifest
icons/                   16/48/128 icons, TikTok-cyan + magenta gradient
src/
├── background.js        Service worker — owns chrome.storage.local I/O
├── injector.js          Content script — bridges page context ↔ extension context
├── interceptor.js       Page-context script — hooks fetch/XHR, parses TikTok feed responses
├── popup.html           Popup UI
└── popup.js             Popup logic — grid render, search, filter, export, delete
docs/screenshot-1.png    README screenshot
privacy-policy.md        Hosted via GitHub Pages
README.md
LICENSE                  MIT
CHANGELOG.md
```

No bundler. Plain JS. Manifest V3.

### Permissions

- `storage`
- `host_permissions: ["https://*.tiktok.com/*"]`
- `web_accessible_resources`: `src/interceptor.js` exposed to the TikTok page context

### Data flow

1. `injector.js` runs at `document_start` on any `tiktok.com` page, injects `interceptor.js` into the page's own JS context using a `<script>` tag.
2. `interceptor.js` monkey-patches `window.fetch` and `XMLHttpRequest` to observe responses. When a response URL looks like a TikTok feed endpoint, it parses the JSON and extracts the video metadata.
3. `interceptor.js` posts each extracted video via `window.postMessage`.
4. `injector.js` listens for those messages and forwards them to the background service worker via `chrome.runtime.sendMessage`.
5. `background.js` writes each entry into `chrome.storage.local`, enforces the 10 000-item cap (oldest pruned first), and deduplicates by `videoId`.
6. `popup.js` reads from `chrome.storage.local` when opened, renders the grid.

### TikTok feed endpoints to watch for (to be confirmed during implementation)

- `/api/recommend/item_list/` — For You Page
- `/api/following/items/` — Following feed
- `/api/post/item_list/` — creator profile videos
- `/api/search/general/full/` or similar — search results
- `/api/related/item_list/` — related videos
- Any other `item_list` / `feed` endpoint that returns video metadata

Actual endpoint discovery happens during implementation by observing real network traffic in DevTools.

## UI — popup

- 440 px wide, max 580 px tall — matches the Instagram extension's popup shell.
- Header: "View History" title (TikTok cyan → magenta gradient on the word), stats counter, export + clear icon buttons.
- Controls row: single search input (covers username, caption, sound, hashtag) + filter pills.
- **Filter pills:** `All`, `Short (<30s)`, `Long (≥30s)` — or drop entirely if that feels noisy; final call during implementation review.
- **Grid:** two columns, 9:16 portrait aspect-ratio tiles. Each tile shows the thumbnail with a hover overlay: creator username, duration, sound name, delete button.
- Click a tile → opens the TikTok URL in a new tab (target `_blank`, `noopener`).
- Footer: Privacy link, Report-issue link, version label — same pattern as Instagram extension v1.0.1.
- Flexbox column layout so the footer stays anchored regardless of content length.

## Storage

- `chrome.storage.local`, single key `history` holding an array of entries sorted newest-first.
- 10 000-item hard cap. On insert, if `length > 10000`, drop the oldest.
- Dedupe by `videoId` — re-observing the same video updates `viewedAt` but does not create a new row.

## Privacy

- Zero outbound network requests from the extension.
- No analytics, no telemetry, no crash reporting, no third-party SDKs.
- Data stored only on the user's device.
- Uninstalling removes all stored data (`chrome.storage.local` is per-extension).
- Privacy policy document reused from Instagram extension template, updated for TikTok specifics (mention `soundName`, `hashtags`, `sourceFeed`).

## Release plan

Mirror the Instagram extension's proven path:

1. Build manifest, src, icons locally. Load unpacked, manually verify on real TikTok pages.
2. Initialize git, create GitHub repo `tiktok-view-history` (public).
3. Host privacy policy via GitHub Pages from repo root.
4. Tag `v1.0.0`, attach clean store-ready zip (manifest + icons + src only) to a GitHub Release.
5. Create Chrome Web Store developer item — upload zip, fill out Privacy Practices fields using the same justification template as the Instagram extension (substituting `tiktok.com` for `instagram.com`).
6. Submit for review.

## Success criteria

- Visiting `https://www.tiktok.com/foryou` and swiping through ~10 videos results in those 10 videos appearing in the popup within seconds.
- Visiting a creator profile (e.g., `https://www.tiktok.com/@username`) logs the visible video thumbnails.
- Searching for a hashtag or sound name in the popup returns the expected entries.
- Clicking a thumbnail opens the correct TikTok video URL in a new tab.
- Uninstalling the extension wipes all stored data.
- The extension makes zero outbound network requests (verifiable in DevTools → Network with filter `is:third-party`).
- Submission passes Chrome Web Store review on first pass (same policy fit as the Instagram extension).

## Open questions — to resolve during implementation

- **Actual TikTok feed endpoint URLs and response shapes.** Discovered by observing real network traffic; this shapes the interceptor parser.
- **Whether `textExtra` or an equivalent exists in the feed response for clean hashtag extraction** — fallback is regex-parsing the caption.
- **Whether `sourceFeed` is inferrable from the endpoint path.** If yes, include it; if not, drop it from v1.0.0.
- **Filter pills: keep or drop?** Decide after seeing the grid populated with real data.
