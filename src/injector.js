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
