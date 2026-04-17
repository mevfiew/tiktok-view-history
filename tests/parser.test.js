import { test } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { parseFeedResponse, isFeedEndpoint } from '../src/lib/parser.js';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/tiktok-feed-response.json', import.meta.url))
);

test('parseFeedResponse returns at least one entry', () => {
  const entries = parseFeedResponse(fixture);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0, `expected > 0 entries, got ${entries.length}`);
});

test('each entry has required fields', () => {
  const entries = parseFeedResponse(fixture);
  for (const e of entries) {
    assert.strictEqual(typeof e.videoId, 'string');
    assert.ok(e.videoId.length > 0);
    assert.match(e.url, /^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+/);
    assert.strictEqual(typeof e.creatorUsername, 'string');
    assert.strictEqual(typeof e.thumbnailUrl, 'string');
    if (e.thumbnailUrl) assert.match(e.thumbnailUrl, /^https?:\/\//);
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

test('isFeedEndpoint matches known feed URLs', () => {
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/recommend/item_list/?aid=1988'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/preload/item_list/?count=3'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/post/item_list/?count=30'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/following/item_list/'), true);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/related/item_list/'), true);
});

test('isFeedEndpoint rejects unrelated URLs', () => {
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/api/user/detail/'), false);
  assert.strictEqual(isFeedEndpoint('https://www.tiktok.com/'), false);
  assert.strictEqual(isFeedEndpoint('https://example.com/api/item_list/'), false);
  assert.strictEqual(isFeedEndpoint('not-a-url'), false);
});

test('parseFeedResponse handles empty/malformed input', () => {
  assert.deepStrictEqual(parseFeedResponse(null), []);
  assert.deepStrictEqual(parseFeedResponse(undefined), []);
  assert.deepStrictEqual(parseFeedResponse({}), []);
  assert.deepStrictEqual(parseFeedResponse({ itemList: null }), []);
});
