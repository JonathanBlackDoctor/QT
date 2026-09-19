import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../.github/workflows/daily-qt.yml', import.meta.url), 'utf8');
test('UTC schedule keeps fast early recovery and hourly retries for the rest of the KST day', () => {
  const crons = [...source.matchAll(/cron: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(crons, [
    '5 15 * * *',
    '20 15 * * *',
    '35,50 15 * * *',
    '5,20,35,50 16-19 * * *',
    '5 0-14,20-23 * * *',
  ]);
  assert.equal((15 + 9) % 24, 0);
  assert.equal((19 + 9) % 24, 4);
  assert.equal((14 + 9) % 24, 23);
});
test('workflow repairs immediately on pipeline push and distinguishes generation from delivery', () => {
  assert.match(source, /push:\n\s+branches: \[main\]/);
  assert.match(source, /needs_generation/);
  assert.match(source, /needs_deployment/);
  assert.match(source, /qt-readiness.mjs --require-ready/);
  assert.match(source, /cancel-in-progress: false/);
  assert.doesNotMatch(source, /continue-on-error: true[\s\S]*?name: Generate missing/);
});
