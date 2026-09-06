import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commentaryRails,
  entryNavigation,
  formatCompactDate,
  selectEntry,
} from '../site/model.js';
import { pageHtml } from '../site/page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('selectEntry honors a valid date and safely falls back for a missing date', () => {
  const index = [{ date: '2026-09-07' }, { date: '2026-09-06' }];
  assert.deepEqual(selectEntry(index, '2026-09-06'), {
    entry: index[1],
    entryIndex: 1,
    selectedDate: '2026-09-06',
    requestedMissing: false,
  });
  assert.equal(selectEntry(index, '2026-09-01').entry, index[0]);
  assert.equal(selectEntry(index, '2026-09-01').requestedMissing, true);
});

test('entryNavigation follows the newest-first content index', () => {
  const index = [{ date: '2026-09-08' }, { date: '2026-09-07' }, { date: '2026-09-06' }];
  assert.deepEqual(entryNavigation(index, 1), { older: index[2], newer: index[0] });
  assert.equal(entryNavigation(index, 0).newer, null);
  assert.equal(entryNavigation(index, 2).older, null);
});

test('commentaryRails preserves commentary wording while exposing verse labels', () => {
  const commentary = '개요입니다. 1-4절에서 시험이 시작됩니다. 설명이 이어집니다. 5-6절은 통혼을 말합니다. 7절은 망각을 말합니다. 10절은 구원을 말합니다.';
  const rails = commentaryRails(commentary);
  assert.deepEqual(rails.map((segment) => segment.label), ['개요', '1–4절', '5–6절', '7절', '10절']);
  assert.equal(rails.map((segment) => segment.text).join(' '), commentary);
});

test('compact dates use the Korean weekday without changing the stored date', () => {
  assert.equal(formatCompactDate('2026-09-06'), '9.06 (일)');
});

test('home template narrows live announcements to a dedicated status region', () => {
  const html = pageHtml('오늘의 QT', 'home');
  assert.match(html, /<main id="app" class="reader-shell">/);
  assert.doesNotMatch(html, /<main[^>]+aria-live/);
  assert.match(html, /id="page-status"[^>]+aria-live="polite"/);
  assert.match(html, /id="toc-trigger"/);
});

test('reader UI excludes note fields and completion streak features', async () => {
  const appSource = await fs.readFile(path.join(ROOT, 'site', 'app.js'), 'utf8');
  assert.doesNotMatch(appSource, /오늘 묵상 완료|연속\s*\d*일|질문에 대한 메모/);
  assert.doesNotMatch(appSource, /type\s*=\s*['"]text['"]/);
});
