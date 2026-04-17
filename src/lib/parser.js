// Field paths confirmed against a real /api/recommend/item_list/ response
// captured via Playwright on 2026-04-17:
//   itemList[].id                      -> videoId
//   itemList[].desc                    -> caption
//   itemList[].author.uniqueId         -> creatorUsername
//   itemList[].author.nickname         -> creatorDisplayName
//   itemList[].music.title             -> soundName
//   itemList[].video.duration          -> durationSec
//   itemList[].video.cover             -> thumbnailUrl
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

const FEED_PATH_PATTERNS = [
  /^\/api\/recommend\/item_list\/?/,
  /^\/api\/preload\/item_list\/?/,
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
