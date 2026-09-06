import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_BOOKS, locateBook, mentionsBook, bibleProjectCandidates } from './project-books.mjs';
import { createHttpClient, SourceError, plainText, safeDiagnosticUrl } from './project-http.mjs';
import { assignedJson, channelIdentity, videoCandidates, parseBibleProject, parseCaptions, createProjectCollector } from './project-sources.mjs';
import { createCachedCollector, enrichDocument, mergePerspective, supplementMarkdown, validatePerspectiveSummary, createSummarizer, STATUS_LABELS } from './project-enrichment.mjs';
import { PROJECT_STATUS_LABELS, safeProjectLink, renderProjectPerspectives } from '../site/project-perspectives.js';

const book = locateBook('사사기 3:1-11');
const channelId = 'UC' + 'a'.repeat(22);
const videoId = 'b'.repeat(11);
const fixedTime = '2026-09-06T10:00:00Z';
const articleText = 'Judges describes repeated failures and the need for faithful leadership. '.repeat(9);
const articleHtml = `<html><title>Book of Judges | BibleProject</title><main><h1>Judges</h1><p>${articleText}</p></main></html>`;
const channelHtml = `<script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: channelId, vanityChannelUrl: 'https://www.youtube.com/@readingjesus', title: '리딩지저스' } } })};</script>`;
const searchHtml = `<script>var ytInitialData = ${JSON.stringify({ contents: { videoRenderer: { videoId, title: { runs: [{ text: '사사기 개관 강의' }] } } } })};</script>`;
const playerHtml = (options = {}) => `<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId, channelId, title: '사사기 개관 강의', shortDescription: '공개 설명입니다.', ...options.detail }, captions: options.captions })};</script>`;
const source = () => ({ provider: 'bibleproject', label: '바이블프로젝트', version: 1, book: '사사기', scope: 'book', status: 'ready', reason: '직접 확보', checkedAt: fixedTime, attempts: [], sources: [{ url: 'https://bibleproject.com/guides/book-of-judges/', title: 'Judges', contentKind: 'article', evidenceLevel: 'direct' }], text: articleText });
const summary = '사사기에는 백성의 반복되는 실패와 신실한 지도력의 필요가 드러납니다. 이 책 전체의 흐름을 오늘 본문에 연결해 보면, 지속적인 순종과 하나님이 베푸시는 구원을 함께 살피는 묵상이 가능합니다.';
const generated = () => ({ summary, evidenceQuotes: ['Judges describes repeated failures and the need for faithful leadership.'], summaryStatus: 'ready' });
const doc = () => ({ date: '2026-09-06', status: 'ok', passage: '사사기 3:1-11', title: '보존할 제목', verification: { overall: '직접 확인' }, sections: { summary: '기존 본문 요약', commentary: '기존 주석', questions: ['1','2','3'], projectPerspective: null }, sources: [{ url: 'https://sum.su.or.kr:8888/bible/today', label: '기존 출처' }], evidenceMeta: { manual: false }, generatedAt: 'original' });
function mockRequest(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const hit = routes.find(([pattern]) => typeof pattern === 'string' ? url === pattern : pattern.test(url));
    if (!hit) throw new SourceError('http_404', 404);
    if (hit[1] instanceof Error) throw hit[1];
    return { url, text: hit[1], status: 200 };
  };
}

test('66-book candidates and Korean abbreviations do not assert retrieval success', () => {
  assert.equal(PROJECT_BOOKS.length, 66);
  assert.equal(locateBook('삿3:1-11').en, 'Judges');
  assert.equal(locateBook('알수없음 1:1'), null);
  assert.equal(mentionsBook('사사기 개관', book), true);
  assert.equal(mentionsBook('요한일서', locateBook('요한복음 1:1')), false);
  assert.match(bibleProjectCandidates(book)[0], /book-of-judges/);
});

test('BibleProject extractor rejects navigation-only and wrong-book pages', () => {
  assert.equal(parseBibleProject(articleHtml, book).text, articleText.trim());
  assert.equal(parseBibleProject(articleHtml.replaceAll('Judges', 'Genesis'), book), null);
  assert.equal(parseBibleProject('<title>Home</title><nav>Judges</nav>' + '<p>text </p>'.repeat(200), book), null);
});

test('BibleProject fetch works without CSE and without querying Google', async () => {
  const calls = [];
  const collect = createProjectCollector({ env: {}, now: () => fixedTime, request: mockRequest([[bibleProjectCandidates(book)[0], articleHtml]], calls) });
  const result = await collect('사사기 3:1-11', 'bibleproject');
  assert.equal(result.status, 'ready'); assert.equal(result.searchConfigured, false);
  assert.equal(calls.length, 1); assert.equal(calls.some(x => x.includes('googleapis')), false);
});

test('book-level search fallback avoids exact-verse query and still verifies page text', async () => {
  const calls = [];
  const alternate = 'https://bibleproject.com/articles/judges-overview/';
  const collect = createProjectCollector({ env: { GOOGLE_CSE_API_KEY: 'secret', GOOGLE_CSE_ID: 'cx' }, request: mockRequest([[/googleapis/, JSON.stringify({ items: [{ title: 'Judges overview', link: alternate }] })], [alternate, articleHtml]], calls) });
  const result = await collect('사사기 3:1-11', 'bibleproject');
  assert.equal(result.status, 'ready');
  const query = new URL(calls.find(x => x.includes('googleapis'))).searchParams.get('q');
  assert.ok(query.includes('Judges')); assert.ok(!query.includes('3:1-11'));
  assert.ok(!JSON.stringify(result).includes('key=secret'));
});

test('404 and network failure remain distinct observable states', async () => {
  const missing = await createProjectCollector({ env: {}, request: mockRequest([]) })('사사기 3:1', 'bibleproject');
  const broken = await createProjectCollector({ env: {}, request: async () => { throw new SourceError('timeout'); } })('사사기 3:1', 'bibleproject');
  assert.equal(missing.status, 'not_found'); assert.equal(broken.status, 'fetch_failed');
  assert.equal(broken.attempts[0].outcome, 'timeout');
});

test('YouTube JSON parsing handles quoted braces without executing scripts', () => {
  assert.deepEqual(assignedJson('var ytInitialData = {"title":"a } brace", "x":{"y":2}};', 'ytInitialData'), { title: 'a } brace', x: { y: 2 } });
  assert.equal(assignedJson('var ytInitialData = window.bad();', 'ytInitialData'), null);
  assert.equal(channelIdentity(channelHtml)?.id, channelId);
  assert.equal(channelIdentity(channelHtml, 'UC' + 'c'.repeat(22)), null);
  assert.equal(channelIdentity(channelHtml.replace('@readingjesus', '@someoneelse')), null);
  assert.equal(videoCandidates(searchHtml, book)[0].id, videoId);
});

test('verified official video without captions is metadata only', async () => {
  const collect = createProjectCollector({ env: {}, request: mockRequest([
    ['https://www.youtube.com/@readingjesus', channelHtml], [/\/search\?/, searchHtml], [/\/watch\?/, playerHtml()],
  ]) });
  const result = await collect('사사기 3:1-11', 'readingjesus');
  assert.equal(result.status, 'metadata_only'); assert.equal(result.text, null);
  assert.equal(result.sources[0].contentKind, 'video_metadata');
});

test('another channel cannot be attributed to Reading Jesus', async () => {
  const collect = createProjectCollector({ env: {}, request: mockRequest([
    ['https://www.youtube.com/@readingjesus', channelHtml], [/\/search\?/, searchHtml], [/\/watch\?/, playerHtml({ detail: { channelId: 'UC' + 'z'.repeat(22) } })],
  ]) });
  const result = await collect('사사기 3:1', 'readingjesus');
  assert.notEqual(result.status, 'ready'); assert.equal(result.sources.length, 0);
});

test('captions must actually be retrieved; automatic captions are labeled', async () => {
  const collect = createProjectCollector({ env: {}, request: mockRequest([
    ['https://www.youtube.com/@readingjesus', channelHtml], [/\/search\?/, searchHtml],
    [/\/watch\?/, playerHtml({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=' + videoId + '&signature=secret', languageCode: 'ko', kind: 'asr' }] } } })],
    [/\/api\/timedtext/, JSON.stringify({ events: [{ segs: [{ utf8: '사사기에 대한 강의의 실제 자막 내용입니다. '.repeat(25) }] }] })],
  ]) });
  const result = await collect('사사기 3:1', 'readingjesus');
  assert.equal(result.status, 'ready'); assert.equal(result.sources[0].automaticCaptions, true);
  assert.equal(result.sources[0].contentKind, 'transcript');
  assert.ok(!JSON.stringify(result).includes('signature='));
  assert.equal(parseCaptions('<html>Access denied</html>'), '');
  assert.equal(parseCaptions('<transcript><text>A &amp; B</text><text>C</text></transcript>'), 'A & B C');
});

test('narration is not substituted for an interpretive perspective', async () => {
  const calls = [];
  const collect = createProjectCollector({ env: {}, request: mockRequest([
    ['https://www.youtube.com/@readingjesus', channelHtml], [/\/search\?/, searchHtml], [/\/watch\?/, playerHtml({ detail: { title: '사사기 장별 성경읽기 낭독' } })],
  ], calls) });
  const result = await collect('사사기 3:1', 'readingjesus');
  assert.equal(result.status, 'metadata_only'); assert.equal(calls.some(x => x.includes('timedtext')), false);
});

test('HTTP client rejects off-host redirects before following them', async () => {
  const calls = [];
  const request = createHttpClient({ retries: 0, fetchImpl: async url => { calls.push(url); return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }); } });
  await assert.rejects(request('https://bibleproject.com/guides/book-of-judges/', { hosts: ['bibleproject.com'] }), /disallowed_url/);
  assert.equal(calls.length, 1);
});

test('HTTP client bounds bodies and redacts errors containing credentials', async () => {
  const request = createHttpClient({ retries: 0, maxBytes: 8, fetchImpl: async () => new Response('123456789', { headers: { 'content-type': 'text/plain' } }) });
  await assert.rejects(request('https://bibleproject.com/', { hosts: ['bibleproject.com'] }), /response_too_large/);
  const broken = createHttpClient({ retries: 0, fetchImpl: async () => { throw new Error('key=TOP_SECRET'); } });
  await assert.rejects(broken('https://bibleproject.com/', { hosts: ['bibleproject.com'] }), error => error.message === 'network_error');
  assert.equal(safeDiagnosticUrl('https://www.youtube.com/api/timedtext?signature=SECRET'), 'https://www.youtube.com/api/timedtext');
  assert.equal(plainText('<script>bad()</script><p>&#x110000; hello</p>'), '&#x110000; hello');
});

test('missing model key preserves collected content without a fabricated summary', async () => {
  const result = await createSummarizer({ env: {} })(source(), doc());
  assert.equal(result.summaryStatus, 'missing_api_key'); assert.equal(result.summary, undefined);
});

test('unverified quotes, mixed attribution and invented references are rejected', () => {
  assert.equal(validatePerspectiveSummary(generated(), source(), doc()).summary, summary);
  assert.throws(() => validatePerspectiveSummary({ ...generated(), evidenceQuotes: ['not found in the evidence whatsoever'] }, source(), doc()), /unverified_evidence_quote/);
  assert.throws(() => validatePerspectiveSummary({ ...generated(), summary: summary + ' 리딩지저스에 따르면' }, source(), doc()), /mixed_provider_attribution/);
  assert.throws(() => validatePerspectiveSummary({ ...generated(), summary: summary + ' 누가복음 4:18' }, source(), doc()), /unsupported_bible_reference/);
});

test('supplement changes only allowed fields and never summarizes metadata', async () => {
  const before = doc(); const calls = [];
  const after = await enrichDocument(before, { now: () => fixedTime, collect: async (passage, provider) => provider === 'bibleproject' ? source() : { ...source(), provider, status: 'metadata_only', text: null, label: '리딩지저스', sources: [] }, summarize: async value => { calls.push(value.provider); return generated(); } });
  assert.deepEqual(calls, ['bibleproject']);
  for (const [key, value] of Object.entries(before.sections)) assert.deepEqual(after.sections[key], value);
  for (const key of ['date','title','passage','status','verification','generatedAt']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(after.sources[0], before.sources[0]);
  assert.equal(after.sections.projectPerspectives.bibleproject.summaryStatus, 'ready');
  assert.equal(after.sections.projectPerspectives.readingjesus.summary, null);
  assert.equal(after.sections.projectPerspectives.bibleproject.text, undefined);
  assert.equal(before.sections.projectPerspectives, undefined);
});

test('ready perspectives are idempotent and survive a failed forced refresh', async () => {
  const before = doc();
  const good = await enrichDocument(before, { collect: async () => source(), summarize: async () => generated(), now: () => fixedTime });
  let calls = 0;
  const unchanged = await enrichDocument(good, { collect: async () => { calls++; throw Error(); } });
  assert.strictEqual(unchanged, good); assert.equal(calls, 0);
  const refreshed = await enrichDocument(good, { force: true, collect: async () => { throw Error(); }, now: () => fixedTime });
  assert.equal(refreshed.sections.projectPerspectives.bibleproject.summary, summary);
  assert.equal(refreshed.sections.projectPerspectives.bibleproject.lastAttempt.status, 'fetch_failed');
  assert.equal(mergePerspective(good.sections.projectPerspectives.bibleproject, { passage: '사사기 4:1', summaryStatus: 'failed' }).summaryStatus, 'failed');
});

test('per-book cache is reused across dates and invalidated when search configuration changes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'qt-project-test-'));
  try {
    let calls = 0; const collect = async () => { calls++; return source(); };
    const cached = createCachedCollector({ directory, collect, env: {}, now: () => Date.parse(fixedTime) + 1000 });
    await cached('사사기 2:11-23', 'bibleproject'); await cached('사사기 3:1-11', 'bibleproject'); assert.equal(calls, 1);
    await createCachedCollector({ directory, collect, env: {}, now: () => Date.parse(fixedTime) + 1000 })('사사기 3:1', 'bibleproject'); assert.equal(calls, 1);
    await createCachedCollector({ directory, collect, env: { GOOGLE_CSE_API_KEY: 'new', GOOGLE_CSE_ID: 'id' }, now: () => Date.parse(fixedTime) + 1000 })('사사기 3:1', 'bibleproject'); assert.equal(calls, 2);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Markdown supplement preserves existing text and does not duplicate itself', () => {
  const original = '# Existing QT\n\nOriginal text must remain.\n';
  const states = { bibleproject: { ...source(), ...generated() } };
  const first = supplementMarkdown(original, states);
  assert.ok(first.startsWith(original)); assert.equal(supplementMarkdown(first, states), first);
  assert.equal(first.match(/project-perspectives:start/g).length, 1);
});

test('source status labels and URL safety agree with renderer', () => {
  assert.deepEqual(PROJECT_STATUS_LABELS, STATUS_LABELS);
  assert.equal(safeProjectLink('javascript:alert(1)'), false);
  assert.equal(safeProjectLink('https://youtube.com.evil.example/watch?v=bad'), false);
  assert.equal(safeProjectLink('https://www.youtube.com/watch?v=bbbbbbbbbbb'), true);
});

test('reader renders independent statuses, not a disabled empty project row', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    setAttribute(name, value) { this[name] = value; }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: value => ({ textContent: value }) };
  try {
    const result = renderProjectPerspectives({ projectPerspectives: { bibleproject: { ...source(), ...generated() }, readingjesus: { status: 'fetch_failed', reason: '접속에 실패했습니다.' } } });
    const serialized = JSON.stringify(result);
    assert.equal(result.tag, 'details'); assert.ok(serialized.includes('관점 준비됨')); assert.ok(serialized.includes('접속 실패'));
    assert.ok(!serialized.includes('aria-disabled'));
  } finally { globalThis.document = previous; }
});
