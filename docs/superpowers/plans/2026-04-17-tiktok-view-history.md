# TikTok View History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome MV3 extension that logs every TikTok video the browser loads into a searchable local history, mirroring the already-shipped Instagram View History extension.

**Architecture:** Page-context interceptor monkey-patches `fetch` / `XHR`, passes TikTok feed responses through a pure JS parser, forwards the extracted video metadata via `postMessage` → content script → service worker → `chrome.storage.local`. Popup reads history from storage, renders a 2-column 9:16 grid built with safe DOM APIs (no `innerHTML` on user data). Pure parser logic is unit-tested with `node --test`; Chrome-API-dependent code is manually verified against real TikTok.

**Tech Stack:** Chrome Extension MV3, plain ES modules, `chrome.storage.local`, `node:test` for unit tests, Playwright MCP for fixture capture, GitHub Pages for privacy policy hosting, GitHub Releases for tagged zips.

---

## File Structure

```
tiktok-view-history/
├── manifest.json
├── package.json              # Scripts only — no runtime deps
├── .gitignore
├── README.md
├── LICENSE                   # MIT
├── CHANGELOG.md
├── privacy-policy.md         # Served by GitHub Pages
├── docs/
│   ├── screenshot-1.png      # README + store listing
│   └── superpowers/
│       ├── specs/2026-04-17-tiktok-view-history-design.md
│       └── plans/2026-04-17-tiktok-view-history.md   # (this file)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js         # Service worker — storage.local I/O, messaging
│   ├── injector.js           # Content script — bridge between page and extension
│   ├── interceptor.js        # Page context module — hooks fetch/XHR, parses responses
│   ├── popup.html            # Popup markup + styles
│   ├── popup.js              # Popup logic — render, search, filter, export
│   └── lib/
│       └── parser.js         # Pure ES module — response parser, endpoint recognizer
├── tests/
│   ├── fixtures/
│   │   └── tiktok-feed-response.json   # Captured real TikTok API response
│   └── parser.test.js        # node --test
└── store-assets/             # LOCAL ONLY (gitignored) — cheatsheet + extra assets
    ├── description.txt
    └── chrome-web-store-submission.md
```

**Split rationale:** the pure parser lives in `src/lib/parser.js` so the same code is imported by both `src/interceptor.js` (browser) and `tests/parser.test.js` (Node). Everything else stays monolithic — the Instagram extension shipped with self-contained files and the same structure works fine for this scale.

---

## Task 1: Project scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `.gitignore`

Sets up the bare minimum to load the extension unpacked in Chrome and run `node --test`.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "TikTok View History",
  "version": "1.0.0",
  "description": "Automatically tracks TikTok videos you view so you can find them later. 100% local, no tracking.",
  "permissions": ["storage"],
  "host_permissions": ["https://*.tiktok.com/*"],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://*.tiktok.com/*"],
    "js": ["src/injector.js"],
    "run_at": "document_start"
  }],
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "web_accessible_resources": [{
    "resources": ["src/interceptor.js", "src/lib/parser.js"],
    "matches": ["https://*.tiktok.com/*"]
  }]
}
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "tiktok-view-history",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
.DS_Store
*.zip
node_modules/
.vscode/
.idea/

# Store submission artifacts — kept local only
store-assets/
```

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/tiktok-view-history
git add manifest.json package.json .gitignore
git commit -m "Scaffold: manifest.json, package.json, .gitignore"
```

---

## Task 2: Capture a real TikTok feed response fixture

**Files:**
- Create: `tests/fixtures/tiktok-feed-response.json`

The entire parser design rides on knowing TikTok's actual response shape. Capture one from a real page load via Playwright MCP.

- [ ] **Step 1: Launch Playwright and start network capture**

Use the Playwright MCP `browser_navigate` + `browser_network_requests` to open `https://www.tiktok.com/foryou`. Scroll via `browser_press_key` (ArrowDown) five times to trigger feed loads.

- [ ] **Step 2: Identify the feed endpoint**

Expected candidates (order of likelihood):
- `https://www.tiktok.com/api/recommend/item_list/`
- `https://www.tiktok.com/api/post/item_list/`
- `https://www.tiktok.com/api/following/item_list/`

Grab the request URL of the one that returns a JSON body with an `itemList` (or similar) array of video objects.

- [ ] **Step 3: Save a real response body to disk**

Use `browser_evaluate` to refetch the same endpoint from page context, then save the parsed JSON:

```javascript
// Inside browser_evaluate:
(async () => {
  const url = '<captured endpoint URL>';
  const r = await fetch(url);
  return await r.json();
})()
```

Write the returned JSON to `tests/fixtures/tiktok-feed-response.json` using the `Write` tool.

- [ ] **Step 4: Inspect the JSON structure**

Read the fixture file. Identify the path to:
- The array of video items (likely `itemList` or `aweme_list`)
- Per-item: `id`, `desc` (caption), `author.uniqueId`, `author.nickname`, `music.title`, `video.duration`, `video.cover` / `video.dynamicCover`, `textExtra` (hashtags)

Document the exact paths in a comment at the top of `src/lib/parser.js` (next task).

- [ ] **Step 5: Commit the fixture**

```bash
git add tests/fixtures/tiktok-feed-response.json
git commit -m "Fixture: real TikTok feed response captured via Playwright"
```

**Fallback if Playwright is blocked or login-walled:** ask the user to open DevTools on tiktok.com, copy a response body from the Network tab, paste into `tests/fixtures/tiktok-feed-response.json` manually.

---

## Task 3: Parser — `parseFeedResponse()` (TDD)

**Files:**
- Create: `src/lib/parser.js`
- Create: `tests/parser.test.js`

Pure, testable function: given a parsed JSON feed response, return an array of normalized `HistoryEntry` objects.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/parser.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { parseFeedResponse } from '../src/lib/parser.js';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/tiktok-feed-response.json', import.meta.url))
);

test('parseFeedResponse returns at least one entry', () => {
  const entries = parseFeedResponse(fixture);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);
});

test('each entry has required fields', () => {
  const entries = parseFeedResponse(fixture);
  for (const e of entries) {
    assert.strictEqual(typeof e.videoId, 'string');
    assert.ok(e.videoId.length > 0);
    assert.match(e.url, /^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+/);
    assert.strictEqual(typeof e.creatorUsername, 'string');
    assert.strictEqual(typeof e.thumbnailUrl, 'string');
    assert.match(e.thumbnailUrl, /^https?:\/\//);
    assert.ok(typeof e.durationSec === 'number' && e.durationSec >= 0);
    assert.ok(Array.isArray(e.hashtags));
  }
});

test('caption is truncated to 500 chars', () => {
  const entries = parseFeedResponse(fixture);
  for (const e of entries) {
    assert.ok(e.caption.length <= 500);
  }
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ~/Desktop/tiktok-view-history
npm test
```

Expected: `Cannot find module '../src/lib/parser.js'` or similar.

- [ ] **Step 3: Write `src/lib/parser.js`**

```javascript
// Fixture paths (from real TikTok feed response):
//   itemList[].id                     -> videoId
//   itemList[].desc                   -> caption
//   itemList[].author.uniqueId        -> creatorUsername
//   itemList[].author.nickname        -> creatorDisplayName
//   itemList[].music.title            -> soundName
//   itemList[].video.duration         -> durationSec
//   itemList[].video.cover            -> thumbnailUrl
//   itemList[].textExtra[].hashtagName -> hashtags

const CAPTION_MAX = 500;

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

function extractHashtagsFromTextExtra(textExtra) {
  if (!Array.isArray(textExtra)) return [];
  return textExtra
    .map(t => t?.hashtagName)
    .filter(name => typeof name === 'string' && name.length > 0);
}

export function parseFeedResponse(json) {
  const items = json?.itemList || json?.aweme_list || [];
  if (!Array.isArray(items)) return [];

  const out = [];
  for (const item of items) {
    const videoId = item?.id || item?.aweme_id;
    const username = item?.author?.uniqueId || item?.author?.unique_id;
    if (!videoId || !username) continue;

    out.push({
      videoId: String(videoId),
      url: `https://www.tiktok.com/@${username}/video/${videoId}`,
      thumbnailUrl: item?.video?.cover || item?.video?.originCover || item?.video?.dynamicCover || '',
      caption: truncate(item?.desc || '', CAPTION_MAX),
      creatorUsername: username,
      creatorDisplayName: item?.author?.nickname || username,
      soundName: item?.music?.title || '',
      hashtags: extractHashtagsFromTextExtra(item?.textExtra),
      durationSec: Number(item?.video?.duration || 0),
      viewedAt: Date.now()
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test
```

Expected: all 3 tests pass. If any fail, adjust paths in parser.js based on the actual fixture structure inspected in Task 2 Step 4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser.js tests/parser.test.js
git commit -m "Parser: parseFeedResponse extracts normalized HistoryEntry objects

Pure ES module with no browser deps so the same code runs in the
page-context interceptor and under node --test.
"
```

---

## Task 4: Parser — `isFeedEndpoint()` (TDD)

**Files:**
- Modify: `src/lib/parser.js`
- Modify: `tests/parser.test.js`

Classifier that tells the interceptor whether a given request URL is worth parsing.

- [ ] **Step 1: Add failing tests**

Append to `tests/parser.test.js`:

```javascript
import { isFeedEndpoint } from '../src/lib/parser.js';

test('isFeedEndpoint matches known feed URLs', () => {
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/recommend/item_list/?aid=1988'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/post/item_list/?count=30'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/following/item_list/'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/related/item_list/'), true);
});

test('isFeedEndpoint rejects unrelated URLs', () => {
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/user/detail/'), false);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/'), false);
  assert.strictEqual(isFeedEndpoint('https://example.com/api/item_list/'), false);
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npm test
```

Expected: `isFeedEndpoint is not a function` or similar.

- [ ] **Step 3: Append to `src/lib/parser.js`**

```javascript
const FEED_PATH_PATTERNS = [
  /^\/api\/recommend\/item_list\/?/,
  /^\/api\/post\/item_list\/?/,
  /^\/api\/following\/item_list\/?/,
  /^\/api\/related\/item_list\/?/,
  /^\/api\/search\/general\/full\/?/
];

export function isFeedEndpoint(urlString) {
  try {
    const u = new URL(urlString);
    if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return false;
    return FEED_PATH_PATTERNS.some(rx => rx.test(u.pathname));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser.js tests/parser.test.js
git commit -m "Parser: isFeedEndpoint classifier"
```

---

## Task 5: Interceptor

**Files:**
- Create: `src/interceptor.js`

Runs in page context. Monkey-patches `fetch` and `XMLHttpRequest`. On a feed-endpoint match, parses the response and posts each entry back via `window.postMessage`.

- [ ] **Step 1: Write `src/interceptor.js`**

```javascript
import { parseFeedResponse, isFeedEndpoint } from './lib/parser.js';

const MSG_TYPE = 'tiktok-view-history:entries';

function report(entries) {
  if (!entries?.length) return;
  window.postMessage({ type: MSG_TYPE, entries }, '*');
}

const originalFetch = window.fetch;
window.fetch = async function patchedFetch(...args) {
  const response = await originalFetch.apply(this, args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (url && isFeedEndpoint(url)) {
      response.clone().json().then(json => report(parseFeedResponse(json))).catch(() => {});
    }
  } catch {}
  return response;
};

const OrigXHR = window.XMLHttpRequest;
function PatchedXHR() {
  const xhr = new OrigXHR();
  const origOpen = xhr.open;
  let lastUrl = '';
  xhr.open = function(method, url, ...rest) {
    lastUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  xhr.addEventListener('load', () => {
    try {
      if (isFeedEndpoint(lastUrl) && (xhr.responseType === '' || xhr.responseType === 'text')) {
        const json = JSON.parse(xhr.responseText);
        report(parseFeedResponse(json));
      }
    } catch {}
  });
  return xhr;
}
window.XMLHttpRequest = PatchedXHR;
```

- [ ] **Step 2: Lint check — no syntax errors**

```bash
node --check src/interceptor.js
```

Expected: no output (valid syntax).

**Note:** this file imports from `./lib/parser.js` and will be loaded as `type="module"` by the injector. The parser path is relative to interceptor's own URL under `chrome-extension://<id>/src/interceptor.js`, so `./lib/parser.js` resolves correctly.

- [ ] **Step 3: Commit**

```bash
git add src/interceptor.js
git commit -m "Interceptor: monkey-patch fetch and XHR, forward feed entries via postMessage"
```

---

## Task 6: Injector

**Files:**
- Create: `src/injector.js`

Content script that runs in the isolated world. It injects `interceptor.js` into the page's own JS context and relays `postMessage` events from the page to the service worker.

- [ ] **Step 1: Write `src/injector.js`**

```javascript
const MSG_TYPE = 'tiktok-view-history:entries';

(function injectInterceptor() {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('src/interceptor.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
})();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== MSG_TYPE) return;
  const entries = event.data.entries;
  if (!Array.isArray(entries) || entries.length === 0) return;
  chrome.runtime.sendMessage({ type: MSG_TYPE, entries }).catch(() => {});
});
```

- [ ] **Step 2: Syntax check**

```bash
node --check src/injector.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/injector.js
git commit -m "Injector: loads interceptor in page context, relays entries to service worker"
```

---

## Task 7: Background service worker

**Files:**
- Create: `src/background.js`

MV3 service worker. Listens for relayed entries, dedupes by `videoId`, prunes to 10 000 items, writes to `chrome.storage.local`. Also responds to popup requests.

- [ ] **Step 1: Write `src/background.js`**

```javascript
const STORAGE_KEY = 'history';
const MAX_ITEMS = 10000;
const MSG_TYPE = 'tiktok-view-history:entries';

async function loadHistory() {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(out[STORAGE_KEY]) ? out[STORAGE_KEY] : [];
}

async function saveHistory(history) {
  await chrome.storage.local.set({ [STORAGE_KEY]: history });
}

function mergeEntries(existing, incoming) {
  const byId = new Map();
  for (const e of existing) byId.set(e.videoId, e);
  for (const e of incoming) {
    const prev = byId.get(e.videoId);
    byId.set(e.videoId, { ...prev, ...e, viewedAt: e.viewedAt || prev?.viewedAt || Date.now() });
  }
  const merged = Array.from(byId.values()).sort((a, b) => b.viewedAt - a.viewedAt);
  return merged.length > MAX_ITEMS ? merged.slice(0, MAX_ITEMS) : merged;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG_TYPE) {
    (async () => {
      const existing = await loadHistory();
      const merged = mergeEntries(existing, msg.entries || []);
      await saveHistory(merged);
      sendResponse({ ok: true, count: merged.length });
    })();
    return true;
  }
  if (msg?.type === 'tiktok-view-history:get') {
    (async () => sendResponse({ ok: true, history: await loadHistory() }))();
    return true;
  }
  if (msg?.type === 'tiktok-view-history:clear') {
    (async () => {
      await saveHistory([]);
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg?.type === 'tiktok-view-history:delete') {
    (async () => {
      const existing = await loadHistory();
      const next = existing.filter(e => e.videoId !== msg.videoId);
      await saveHistory(next);
      sendResponse({ ok: true, count: next.length });
    })();
    return true;
  }
});
```

- [ ] **Step 2: Syntax check**

```bash
node --check src/background.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/background.js
git commit -m "Background: storage.local I/O with dedupe, prune to 10k, and popup message handlers"
```

---

## Task 8: Popup HTML + CSS

**Files:**
- Create: `src/popup.html`

Shell mirrors the Instagram View History v1.0.1 popup: sticky header, scrolling content, anchored footer. Grid swapped to 2 columns with 9:16 aspect ratio. All static markup — dynamic content is built by `popup.js` using safe DOM APIs.

- [ ] **Step 1: Write `src/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: 440px;
      max-height: 580px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fafafa;
      color: #262626;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .header {
      background: #fff;
      border-bottom: 1px solid #dbdbdb;
      padding: 12px 14px 10px;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand h1 {
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, #25F4EE 0%, #FE2C55 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stats { font-size: 10px; color: #8e8e8e; letter-spacing: 0.2px; }

    .header-actions { display: flex; gap: 5px; align-items: center; }
    .icon-btn {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px;
      border: 1px solid #dbdbdb; background: #fff; cursor: pointer;
      color: #262626; font-size: 13px; transition: all 0.15s;
    }
    .icon-btn:hover { background: #f0f0f0; }
    .icon-btn.danger:hover { background: #fef2f2; border-color: #FE2C55; color: #FE2C55; }

    .controls { display: flex; gap: 6px; }
    .search-bar {
      flex: 1; padding: 7px 10px;
      border: 1px solid #dbdbdb; border-radius: 8px;
      font-size: 12px; background: #efefef; outline: none;
      transition: all 0.15s;
    }
    .search-bar:focus { border-color: #a8a8a8; background: #fff; }

    .filter-pills { display: flex; gap: 4px; align-items: center; }
    .pill {
      font-size: 11px; padding: 5px 10px;
      border-radius: 16px; border: 1px solid #dbdbdb;
      background: #fff; cursor: pointer;
      font-weight: 500; color: #8e8e8e;
      transition: all 0.15s; white-space: nowrap;
    }
    .pill:hover { border-color: #262626; color: #262626; }
    .pill.active { background: #262626; border-color: #262626; color: #fff; }

    .content { padding: 6px; overflow-y: auto; flex: 1; min-height: 0; }

    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }

    .grid-item {
      position: relative; aspect-ratio: 9 / 16;
      overflow: hidden; border-radius: 4px;
      cursor: pointer; background: #222;
      text-decoration: none;
    }
    .grid-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
    .grid-item:hover img { transform: scale(1.04); }

    .grid-item .overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.75) 100%);
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 8px;
    }
    .overlay-top { display: flex; justify-content: space-between; align-items: flex-start; opacity: 0; transition: opacity 0.15s; }
    .grid-item:hover .overlay-top { opacity: 1; }

    .duration-badge {
      font-size: 9px; background: rgba(0,0,0,0.7); color: #fff;
      padding: 2px 6px; border-radius: 3px;
      font-weight: 600; backdrop-filter: blur(4px);
    }
    .delete-btn {
      width: 20px; height: 20px; border-radius: 50%;
      border: none; background: rgba(0,0,0,0.65); color: #fff;
      font-size: 11px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(4px); transition: background 0.15s;
    }
    .delete-btn:hover { background: #FE2C55; }

    .overlay-bottom { display: flex; flex-direction: column; gap: 2px; }
    .overlay-bottom .username { font-size: 11px; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.6); }
    .overlay-bottom .sound { font-size: 9px; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .empty { text-align: center; padding: 50px 20px; color: #8e8e8e; grid-column: 1 / -1; }
    .empty-icon { font-size: 36px; margin-bottom: 10px; }
    .empty h2 { font-size: 14px; color: #262626; margin-bottom: 4px; font-weight: 600; }
    .empty p { font-size: 12px; line-height: 1.5; }

    .footer {
      border-top: 1px solid #dbdbdb; background: #fff;
      padding: 7px 14px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #8e8e8e; flex-shrink: 0;
    }
    .footer-links { display: flex; gap: 10px; }
    .footer a { color: #8e8e8e; text-decoration: none; transition: color 0.15s; }
    .footer a:hover { color: #262626; text-decoration: underline; }
    .footer .version { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; letter-spacing: 0.3px; }

    .content::-webkit-scrollbar { width: 6px; }
    .content::-webkit-scrollbar-thumb { background: #dbdbdb; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="brand">
        <div>
          <h1>View History</h1>
          <span class="stats" id="stats">Loading...</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="exportBtn" title="Export as JSON">&#x2B07;</button>
        <button class="icon-btn danger" id="clearBtn" title="Clear all history">&#x1F5D1;</button>
      </div>
    </div>
    <div class="controls">
      <input type="text" class="search-bar" id="searchInput" placeholder="Search creator, caption, sound, #hashtag...">
      <div class="filter-pills">
        <button class="pill active" data-filter="all">All</button>
        <button class="pill" data-filter="short">Short</button>
        <button class="pill" data-filter="long">Long</button>
      </div>
    </div>
  </div>

  <div class="content" id="content">
    <div class="grid" id="grid"></div>
  </div>

  <div class="footer">
    <div class="footer-links">
      <a href="https://mevfiew.github.io/tiktok-view-history/privacy-policy.html" target="_blank" rel="noopener">Privacy</a>
      <a href="https://github.com/mevfiew/tiktok-view-history/issues/new" target="_blank" rel="noopener">Report issue</a>
    </div>
    <span class="version">v1.0.0</span>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/popup.html
git commit -m "Popup: HTML shell with 2-col 9:16 grid and TikTok cyan/magenta gradient"
```

---

## Task 9: Popup logic (safe DOM construction)

**Files:**
- Create: `src/popup.js`

Handles: load history from service worker, render grid, search, filter (all/short/long), delete, clear, export. **All user-supplied strings (captions, usernames, sound names, thumbnail URLs) are set via `textContent` or validated URL assignment — never `innerHTML`.** The only HTML injected via `innerHTML` is the static empty-state markup (no dynamic data).

- [ ] **Step 1: Write `src/popup.js`**

```javascript
const SHORT_THRESHOLD_SEC = 30;

let allEntries = [];
let currentFilter = 'all';
let currentSearch = '';

const grid = document.getElementById('grid');
const stats = document.getElementById('stats');
const searchInput = document.getElementById('searchInput');
const pills = document.querySelectorAll('.pill');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch {
    return '';
  }
}

function matchesSearch(entry, query) {
  if (!query) return true;
  const q = query.toLowerCase().replace(/^#/, '');
  const haystacks = [
    entry.creatorUsername,
    entry.creatorDisplayName,
    entry.caption,
    entry.soundName
  ];
  if (haystacks.some(s => typeof s === 'string' && s.toLowerCase().includes(q))) return true;
  if (Array.isArray(entry.hashtags) && entry.hashtags.some(h => h.toLowerCase().includes(q))) return true;
  return false;
}

function matchesFilter(entry, filter) {
  if (filter === 'all') return true;
  if (filter === 'short') return entry.durationSec < SHORT_THRESHOLD_SEC;
  if (filter === 'long') return entry.durationSec >= SHORT_THRESHOLD_SEC;
  return true;
}

function fmtDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function createEmptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  const isTrulyEmpty = allEntries.length === 0;
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '🎬';
  const h2 = document.createElement('h2');
  h2.textContent = isTrulyEmpty ? 'No history yet' : 'Nothing matches';
  const p = document.createElement('p');
  p.textContent = isTrulyEmpty
    ? 'Browse TikTok and videos will appear here automatically.'
    : 'Try a different search or filter.';
  wrap.append(icon, h2, p);
  return wrap;
}

function createGridItem(entry) {
  const link = document.createElement('a');
  link.className = 'grid-item';
  const safeUrl = safeHttpUrl(entry.url);
  if (safeUrl) {
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.dataset.id = entry.videoId;

  const safeThumb = safeHttpUrl(entry.thumbnailUrl);
  if (safeThumb) {
    const img = document.createElement('img');
    img.src = safeThumb;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    link.appendChild(img);
  }

  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const top = document.createElement('div');
  top.className = 'overlay-top';
  const badge = document.createElement('span');
  badge.className = 'duration-badge';
  badge.textContent = fmtDuration(entry.durationSec);
  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.type = 'button';
  del.title = 'Remove';
  del.textContent = '\u2715'; // ✕
  del.dataset.del = entry.videoId;
  top.append(badge, del);

  const bottom = document.createElement('div');
  bottom.className = 'overlay-bottom';
  const user = document.createElement('span');
  user.className = 'username';
  user.textContent = '@' + (entry.creatorUsername || '');
  bottom.appendChild(user);
  if (entry.soundName) {
    const sound = document.createElement('span');
    sound.className = 'sound';
    sound.textContent = '\u266A ' + entry.soundName; // ♪
    bottom.appendChild(sound);
  }

  overlay.append(top, bottom);
  link.appendChild(overlay);
  return link;
}

function render() {
  const filtered = allEntries.filter(e => matchesFilter(e, currentFilter) && matchesSearch(e, currentSearch));
  const suffix = filtered.length !== allEntries.length ? ` of ${allEntries.length}` : '';
  stats.textContent = `${filtered.length}${suffix} items`;

  grid.textContent = '';
  if (filtered.length === 0) {
    grid.appendChild(createEmptyState());
    return;
  }

  const frag = document.createDocumentFragment();
  for (const entry of filtered) frag.appendChild(createGridItem(entry));
  grid.appendChild(frag);

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = btn.getAttribute('data-del');
      await chrome.runtime.sendMessage({ type: 'tiktok-view-history:delete', videoId: id });
      allEntries = allEntries.filter(e => e.videoId !== id);
      render();
    });
  });
}

async function load() {
  const res = await chrome.runtime.sendMessage({ type: 'tiktok-view-history:get' });
  allEntries = res?.history || [];
  render();
}

searchInput.addEventListener('input', (e) => {
  currentSearch = e.target.value;
  render();
});

pills.forEach(p => p.addEventListener('click', () => {
  pills.forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  currentFilter = p.getAttribute('data-filter');
  render();
}));

exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allEntries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tiktok-view-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all TikTok view history? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'tiktok-view-history:clear' });
  allEntries = [];
  render();
});

load();
```

- [ ] **Step 2: Syntax check**

```bash
node --check src/popup.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/popup.js
git commit -m "Popup: safe DOM construction, search, filter, delete, clear, export

All user-supplied strings set via textContent. URLs validated to
http/https only to prevent javascript: scheme injection.
"
```

---

## Task 10: Icons

**Files:**
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

Three PNGs at the required sizes. Use the TikTok cyan → magenta gradient on a "TT" monogram or a history clock motif.

- [ ] **Step 1: Generate icons**

Option A (fastest): render a 128×128 SVG with a linear gradient and text `"TT"`, then rasterize to PNG at 128/48/16 using a headless Chrome via Playwright MCP (navigate to a data URL containing the SVG + `<canvas>` that draws it at the target size, then use `browser_take_screenshot` at each size).

Option B (cleaner but manual): open https://www.figma.com or Photopea, draw a 128×128 icon, export three sizes. The user can do this in ~10 minutes.

**If automation is fragile, default to Option B. As a last resort, drop a solid TikTok-magenta square as a placeholder for v1.0.0 so we are unblocked, and log "proper icon design" as a v1.0.1 CHANGELOG item.**

- [ ] **Step 2: Verify files exist**

```bash
ls -la icons/
```

Expected: three `.png` files with non-zero sizes.

- [ ] **Step 3: Commit**

```bash
git add icons/
git commit -m "Icons: 16/48/128 PNGs in TikTok cyan/magenta gradient"
```

---

## Task 11: Project documentation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Create: `privacy-policy.md`

Ports from the Instagram View History project, renamed and retargeted.

- [ ] **Step 1: Write `LICENSE`**

Copy the Instagram extension's MIT LICENSE verbatim but keep the year 2026 and copyright holder `Mevfiew`.

- [ ] **Step 2: Write `privacy-policy.md`**

Port the Instagram extension's `privacy-policy.md` and:
- Replace all "Instagram" / "instagram.com" with "TikTok" / "tiktok.com"
- Update the "What is stored locally" section to list the TikTok-specific fields: `videoId`, `url`, `thumbnailUrl`, `caption`, `creatorUsername`, `creatorDisplayName`, `soundName`, `hashtags`, `durationSec`, `viewedAt`.
- Update the "Last updated" date to `April 17, 2026`.

- [ ] **Step 3: Write `README.md`**

Port the Instagram extension's README. Replace Instagram references with TikTok. Update the `docs/screenshot-1.png` reference (screenshot captured in Task 12). Update the "How it works" source layout block to match this project's actual files (including `src/lib/parser.js` and `tests/`). Update all repo URL references to `mevfiew/tiktok-view-history`.

- [ ] **Step 4: Write `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-17

### Added
- Automatic capture of TikTok videos as they load in the browser on `tiktok.com`.
- Local storage via `chrome.storage.local` (up to 10 000 items, oldest pruned first).
- Popup UI: 2-column 9:16 grid, search across creator / caption / sound / hashtag, short/long duration filter.
- Individual delete and clear-all actions.
- JSON export of the full history.
- MV3 manifest with zero outbound network requests and no remote code.

[1.0.0]: https://github.com/mevfiew/tiktok-view-history/releases/tag/v1.0.0
```

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE CHANGELOG.md privacy-policy.md
git commit -m "Docs: README, LICENSE (MIT), CHANGELOG, privacy policy"
```

---

## Task 12: Manual end-to-end smoke test

**Files:**
- Create: `docs/screenshot-1.png` (captured during this task)

Load the unpacked extension in Chrome, browse TikTok, verify data flows all the way to the popup, and capture a screenshot for the README + store listing.

- [ ] **Step 1: Load unpacked**

Open Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → pick `~/Desktop/tiktok-view-history`. Confirm the extension shows "TikTok View History v1.0.0" with no errors reported under "Errors".

- [ ] **Step 2: Browse TikTok**

Navigate to `https://www.tiktok.com/foryou`. Scroll through ~15 videos. Then visit a creator profile (`https://www.tiktok.com/@<someone>`). Then a search results page.

- [ ] **Step 3: Open the popup, verify entries**

Click the extension icon. Expect:
- Grid shows at least 10 entries
- Thumbnails render
- Creator usernames render
- Typing a known word in search → filters live
- Clicking "Short" pill → only videos < 30s
- Clicking a tile → opens the correct TikTok URL in a new tab
- Delete button on a tile → tile disappears, persists after reopening the popup
- Clear All → confirms, empties grid

**If nothing shows up:** open DevTools on the popup (`Inspect popup`) and on the TikTok tab. From the popup console, inspect storage:

```javascript
chrome.storage.local.get('history', r => console.log(r));
```

From the TikTok tab's page-context console (NOT the isolated content-script world), check whether the fetch hook is installed:

```javascript
window.fetch.toString();
```

Inspect the Network tab for which endpoints were actually hit and compare to `isFeedEndpoint`'s patterns — update the patterns in `src/lib/parser.js` and re-run `npm test` if any were wrong.

- [ ] **Step 4: Capture screenshot**

With the popup populated, take a screenshot of the popup at actual resolution (~440 × 580). Save to `docs/screenshot-1.png`.

- [ ] **Step 5: Commit**

```bash
git add docs/screenshot-1.png
git commit -m "Docs: popup screenshot from a real TikTok session"
```

---

## Task 13: GitHub repo + Pages

**Files:** none (remote setup)

- [ ] **Step 1: Create public repo and push**

```bash
cd ~/Desktop/tiktok-view-history
gh repo create tiktok-view-history --public --source . --push \
  --description "Chrome extension that automatically tracks TikTok videos you view — 100% local, no tracking."
```

- [ ] **Step 2: Enable GitHub Pages from `main` root**

```bash
gh api -X POST /repos/mevfiew/tiktok-view-history/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

- [ ] **Step 3: Wait for build, verify the privacy policy URL**

```bash
until s=$(gh api /repos/mevfiew/tiktok-view-history/pages/builds/latest --jq '.status'); \
  [ "$s" = "built" ] || [ "$s" = "errored" ]; do sleep 8; done
echo "STATUS: $s"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -L \
  https://mevfiew.github.io/tiktok-view-history/privacy-policy.html
```

Expected: `STATUS: built` and `HTTP 200`.

---

## Task 14: Build clean store zip and publish v1.0.0 release

**Files:**
- Create: `~/Desktop/tiktok-view-history-v1.0.0.zip`

- [ ] **Step 1: Build the zip — extension files only**

```bash
cd ~/Desktop/tiktok-view-history
rm -f ~/Desktop/tiktok-view-history-v1.0.0.zip
zip -r ~/Desktop/tiktok-view-history-v1.0.0.zip manifest.json icons src -x "*.DS_Store"
unzip -l ~/Desktop/tiktok-view-history-v1.0.0.zip
```

Expected: archive contains `manifest.json`, `icons/*`, `src/*` (including `src/lib/parser.js`) — nothing else.

- [ ] **Step 2: Tag and release**

```bash
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 ~/Desktop/tiktok-view-history-v1.0.0.zip \
  --title "v1.0.0 — Initial release" \
  --notes-file CHANGELOG.md
```

- [ ] **Step 3: Verify release**

```bash
gh release view v1.0.0
```

Expected: release exists, zip asset attached.

---

## Task 15: Chrome Web Store submission prep

**Files:**
- Create: `store-assets/description.txt` (local only, gitignored)
- Create: `store-assets/chrome-web-store-submission.md` (local only, gitignored)

- [ ] **Step 1: Write store description**

Port Instagram's `store-assets/description.txt`, replacing Instagram references with TikTok and updating the feature list (mention sound/hashtag search, 2-column vertical grid).

- [ ] **Step 2: Write the submission cheatsheet**

Port Instagram's `store-assets/chrome-web-store-submission.md`, updating:
- Privacy policy URL → `https://mevfiew.github.io/tiktok-view-history/privacy-policy.html`
- Host permission justification → references `*.tiktok.com`
- Single purpose description → mentions TikTok videos
- Homepage URL → `https://github.com/mevfiew/tiktok-view-history`
- Support URL → `https://github.com/mevfiew/tiktok-view-history/issues`

- [ ] **Step 3: Confirm store-assets/ is gitignored and not pushed**

```bash
cd ~/Desktop/tiktok-view-history
git status
```

Expected: `store-assets/` does not appear (ignored by `.gitignore`).

- [ ] **Step 4: User uploads to Chrome Web Store**

This step is manual:
1. https://chrome.google.com/webstore/devconsole → New item
2. Upload `~/Desktop/tiktok-view-history-v1.0.0.zip`
3. Fill Privacy Practices tab using `store-assets/chrome-web-store-submission.md`
4. Fill Store Listing from `store-assets/description.txt` + `docs/screenshot-1.png`
5. Submit for review

---

## Self-review

**1. Spec coverage:**
- Capture everywhere on tiktok.com → Tasks 4 (patterns), 5 (hook), 12 (verification). ✓
- Log trigger = anything TikTok loads → Task 5 (fetch + XHR hooks). ✓
- Data model fields (videoId, url, thumbnailUrl, caption, creator, sound, hashtags, duration, viewedAt) → Task 3. ✓
- `sourceFeed` marked optional in spec, omitted here; reconsider post-smoke if endpoints are obvious. ✓
- Dedupe by videoId + 10 000 prune → Task 7. ✓
- Popup 2-col 9:16 grid, search covering username/caption/sound/hashtag, filter pills, footer with privacy/report/version → Tasks 8–9. ✓
- Privacy policy hosted on GitHub Pages → Task 13. ✓
- `v1.0.0` release with zip on GitHub + Chrome Web Store submission → Tasks 14–15. ✓
- Non-goals (per-zone toggles, live streams, watch-time tracking) → correctly omitted from tasks. ✓

**2. Placeholder scan:** no TBD, TODO, or "similar to above" placeholders. The icons task flags two options — option B leaves a solid-color placeholder, explicitly allowed. The fixture task flags a manual-paste fallback, explicitly specified.

**3. Type consistency:** `HistoryEntry` shape is defined in Task 3 (parser) and consumed in Task 7 (background merge), Task 9 (popup render). Field names match throughout: `videoId`, `url`, `thumbnailUrl`, `caption`, `creatorUsername`, `creatorDisplayName`, `soundName`, `hashtags`, `durationSec`, `viewedAt`. Message types match between injector (Task 6), background (Task 7), and popup (Task 9): `tiktok-view-history:entries`, `tiktok-view-history:get`, `tiktok-view-history:clear`, `tiktok-view-history:delete`.

**4. XSS posture:** all user-origin strings in the popup render via `textContent`. Image and anchor URLs run through `safeHttpUrl()` which rejects anything that isn't `http:` or `https:` (blocks `javascript:`, `data:`, etc.). The only `innerHTML` usage in the codebase is the static empty-state markup which contains no dynamic data.

**5. Risk flag:** Task 5 uses `type="module"` for the interceptor so it can `import` the parser. If TikTok's CSP rejects module scripts from extension origins, fallback is to concatenate parser + interceptor into a single classic script at build time (small shell script in `package.json`). Re-test in Task 12; pivot if needed.
