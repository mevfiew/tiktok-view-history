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
