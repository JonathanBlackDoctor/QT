import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readingDate, millisecondsUntilReadingDay, selectEntry } from '../site/model.js';
import { generationDate } from './qt-readiness.mjs';

const index = ['2026-09-09', '2026-09-08', '2026-09-07', '2026-09-06'].map((date) => ({ date }));
for (const [instant, expected] of [
  ['2026-09-08T00:00:00+09:00', '2026-09-07'],
  ['2026-09-08T03:00:00+09:00', '2026-09-07'],
  ['2026-09-08T03:59:59.999+09:00', '2026-09-07'],
  ['2026-09-08T04:00:00+09:00', '2026-09-08'],
  ['2026-09-08T23:59:59+09:00', '2026-09-08'],
  ['2027-01-01T03:59:59+09:00', '2026-12-31'],
  ['2026-10-01T03:00:00+09:00', '2026-09-30'],
  ['2028-03-01T03:00:00+09:00', '2028-02-29'],
]) {
  test(`04:00 KST reading-day boundary: ${instant}`, () => {
    assert.equal(readingDate(new Date(instant)), expected);
  });
}

test('Tuesday at 03:00 shows Monday despite Tuesday and Wednesday being published', () => {
  assert.equal(selectEntry(index, null, '2026-09-08T03:00:00+09:00').selectedDate, '2026-09-07');
  assert.equal(selectEntry(index, null, '2026-09-08T04:00:00+09:00').selectedDate, '2026-09-08');
});

test('explicit date links override the default boundary', () => {
  assert.equal(selectEntry(index, '2026-09-08', '2026-09-08T03:00:00+09:00').selectedDate, '2026-09-08');
  assert.equal(selectEntry(index, '2026-09-06', '2026-09-08T04:00:00+09:00').selectedDate, '2026-09-06');
});

test('missing dates use closest available past date, not newest/future, without sorting mutation', () => {
  const entries = [index[0], index[3], index[2]];
  assert.equal(selectEntry(entries, null, '2026-09-08T05:00:00+09:00').selectedDate, '2026-09-07');
  assert.equal(selectEntry(entries, '2099-01-01', '2026-09-08T05:00:00+09:00').requestedMissing, true);
  assert.deepEqual(entries, [index[0], index[3], index[2]]);
});

test('empty and future-only indexes do not silently show a future date', () => {
  for (const entries of [null, [], [{ date: '2026-09-09' }]]) {
    assert.equal(selectEntry(entries, null, '2026-09-08T03:00:00+09:00').entry, null);
  }
});

test('the next boundary timer is exactly 04:00 KST', () => {
  assert.equal(millisecondsUntilReadingDay('2026-09-08T03:59:59.999+09:00'), 1);
  assert.equal(millisecondsUntilReadingDay('2026-09-08T03:00:00+09:00'), 3600000);
  assert.equal(millisecondsUntilReadingDay('2026-09-08T04:00:00+09:00'), 86400000);
  assert.throws(() => millisecondsUntilReadingDay('invalid'));
});

test('generation already targets Tuesday at 00:05 while the homepage still shows Monday', () => {
  const now = '2026-09-08T00:05:00+09:00';
  assert.equal(generationDate(now), '2026-09-08');
  assert.equal(readingDate(now), '2026-09-07');
});

test('reading-day selection does not depend on the client machine timezone', () => {
  const moduleUrl = new URL('../site/model.js', import.meta.url).href;
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Seoul']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import {readingDate} from ${JSON.stringify(moduleUrl)}; console.log(readingDate('2026-09-07T18:00:00Z'))`],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(output.trim(), '2026-09-07');
  }
});
