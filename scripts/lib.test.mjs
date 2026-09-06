import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPassages, htmlToText, isWhitelistedUrl, pageMentionsDate } from './lib.mjs';

test('extracts Korean passage references', () => {
  assert.deepEqual(extractPassages('오늘 본문은 마태복음 4:1-11 입니다.'), ['마태복음 4:1-11']);
  assert.deepEqual(extractPassages('본문 렘 7:1~15'), ['렘 7:1-15']);
});

test('extracts SU bilingual and repeated-chapter range format', () => {
  assert.deepEqual(extractPassages('본문 : 사사기(Judges) 3:1 - 3:11 찬송가 390장'), ['사사기 3:1-11']);
  assert.deepEqual(extractPassages('창세기(Genesis) 1:31 - 2:3'), ['창세기 1:31-2:3']);
});

test('date detection understands Korean and ISO dates', () => {
  assert.equal(pageMentionsDate('2026년 9월 7일 월요일', '2026-09-07'), true);
  assert.equal(pageMentionsDate('2026-09-07', '2026-09-07'), true);
  assert.equal(pageMentionsDate('9월 8일', '2026-09-07'), false);
});

test('whitelist requires https and exact known hosts', () => {
  assert.equal(isWhitelistedUrl('https://biblehub.com/foo'), true);
  assert.equal(isWhitelistedUrl('http://biblehub.com/foo'), false);
  assert.equal(isWhitelistedUrl('https://evil.example/?u=biblehub.com'), false);
});

test('html stripping removes scripts and keeps visible text', () => {
  const text = htmlToText('<h1>제목</h1><script>bad()</script><p>본문 &amp; 내용</p>');
  assert.match(text, /제목/);
  assert.match(text, /본문 & 내용/);
  assert.doesNotMatch(text, /bad/);
});
