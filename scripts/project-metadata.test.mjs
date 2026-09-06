import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectCollector, verifiedVideoMetadata } from './project-sources.mjs';
import { locateBook } from './project-books.mjs';
import { SourceError } from './project-http.mjs';

const channelId = 'UC' + 'a'.repeat(22);
const videoId = 'b'.repeat(11);
const book = locateBook('사사기 3:1-11');
const channelHtml = `<script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: channelId, vanityChannelUrl: 'https://www.youtube.com/@readingjesus' } } })};</script>`;
const searchHtml = `<script>var ytInitialData = ${JSON.stringify({ videoRenderer: { videoId, title: { simpleText: '사사기 개관' } } })};</script>`;

test('oEmbed public metadata must match both verified author and book', () => {
  const identity = { id: channelId };
  assert.equal(verifiedVideoMetadata(JSON.stringify({ title: '사사기 개관', author_url: 'https://www.youtube.com/@readingjesus' }), identity, book).channelId, channelId);
  assert.equal(verifiedVideoMetadata(JSON.stringify({ title: '사사기 개관', author_url: 'https://www.youtube.com/@other' }), identity, book), null);
  assert.equal(verifiedVideoMetadata(JSON.stringify({ title: '창세기 개관', author_url: 'https://www.youtube.com/@readingjesus' }), identity, book), null);
  assert.equal(verifiedVideoMetadata(JSON.stringify({ title: '사사기 개관', author_url: 'https://www.youtube.com.evil.test/@readingjesus' }), identity, book), null);
});

test('missing or gated player details retain verified title/channel but never attempt gated captions', async () => {
  const calls = [];
  const request = async url => {
    calls.push(url); let text;
    if (url === 'https://www.youtube.com/@readingjesus') text = channelHtml;
    else if (url.includes('/search?')) text = searchHtml;
    else if (url.includes('/watch?')) text = '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED"}};</script>';
    else if (url.includes('/oembed?')) text = JSON.stringify({ title: '사사기 개관', author_url: 'https://www.youtube.com/@readingjesus' });
    else throw new SourceError('http_404', 404);
    return { url, text, status: 200 };
  };
  const result = await createProjectCollector({ request, env: {} })('사사기 3:1-11', 'readingjesus');
  assert.equal(result.status, 'metadata_only');
  assert.deepEqual(result.sources[0].metadataFields, ['title','channel']);
  assert.equal(result.text, null);
  assert.ok(result.attempts.some(a => a.outcome === 'playback_login_required'));
  assert.ok(!calls.some(url => url.includes('timedtext')));
});
