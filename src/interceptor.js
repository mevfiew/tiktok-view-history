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
