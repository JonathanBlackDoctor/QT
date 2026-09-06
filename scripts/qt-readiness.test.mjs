import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkedDate, contentReadiness, inspectReadiness } from './qt-readiness.mjs';

const date = '2026-09-07';
const doc = { date, status: 'ok', passage: '사사기 3:12-31', sections: { summary: 'summary', commentary: 'commentary', christological: 'connection' } };
const index = [{ date, status: 'ok', path: '2026/09/2026-09-07.json' }];

test('only a complete successful document and matching index are ready', () => {
  assert.equal(contentReadiness(doc, index, date).ready, true);
  assert.equal(contentReadiness(doc, index, date).repair, false);
  assert.equal(contentReadiness(null, index, date).ready, false);
  assert.equal(contentReadiness({ ...doc, status: 'failed' }, index, date).ready, false);
  assert.equal(contentReadiness({ ...doc, sections: null }, index, date).repair, true);
  assert.equal(contentReadiness(doc, [], date).repair, true);
  assert.equal(contentReadiness(doc, [{ ...index[0], path: '../wrong.json' }], date).ready, false);
  assert.equal(contentReadiness({ ...doc, date: '2026-09-06' }, index, date).ready, false);
});

test('date validation rejects path traversal and impossible calendar dates', () => {
  for (const invalid of ['2026-02-30', '2026-13-01', '../content', '2026-9-7', '2026-09-07\nforce=true']) {
    assert.throws(() => checkedDate(invalid));
  }
  assert.equal(checkedDate('2028-02-29'), '2028-02-29');
});

test('filesystem readiness handles missing, corrupted and repaired records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qt-readiness-'));
  try {
    assert.equal((await inspectReadiness(date, root)).ready, false);
    await fs.mkdir(path.join(root, 'content/2026/09'), { recursive: true });
    await fs.writeFile(path.join(root, 'content/index.json'), JSON.stringify(index));
    const file = path.join(root, 'content/2026/09/2026-09-07.json');
    await fs.writeFile(file, '{broken');
    assert.equal((await inspectReadiness(date, root)).ready, false);
    await fs.writeFile(file, JSON.stringify(doc));
    assert.equal((await inspectReadiness(date, root)).ready, true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('publication check detects a stale/missing deployment without regenerating good content', async () => {
  const { inspectPublication } = await import('./qt-readiness.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qt-published-'));
  try {
    await fs.mkdir(path.join(root, 'content/2026/09'), { recursive: true });
    await fs.writeFile(path.join(root, 'content/2026/09/2026-09-07.json'), JSON.stringify(doc));
    const fakeFetch = (remoteDoc, remoteIndex = index) => async (url) => ({ ok: true,
      json: async () => url.pathname.endsWith('index.json') ? remoteIndex : remoteDoc });
    const url = 'https://example.invalid/QT/';
    assert.equal(await inspectPublication(date, root, url, fakeFetch(doc)), true);
    assert.equal(await inspectPublication(date, root, url, fakeFetch({ ...doc, generatedAt: 'stale' })), false);
    assert.equal(await inspectPublication(date, root, url, fakeFetch(doc, [])), false);
    assert.equal(await inspectPublication(date, root, url, async () => ({ ok: false, status: 404 })), false);
    assert.equal(await inspectPublication(date, root, url, async () => { throw new Error('timeout'); }), false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
