import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { millisecondsUntilReadingDay, readingDate, selectEntry } from '../site/model.js';

async function boot({ search = '', index = [{ date: '2026-09-08', path: 'tue.json' }, { date: '2026-09-07', path: 'mon.json' }] } = {}) {
  let now = new Date('2026-09-08T03:00:00+09:00');
  let reloads = 0;
  const listeners = {};
  const timers = [];
  const requests = [];
  const app = { nodes: [], replaceChildren(...nodes) { this.nodes = nodes; }, append(...nodes) { this.nodes.push(...nodes); } };
  const document = { body: { dataset: { page: 'home' } }, visibilityState: 'visible',
    querySelector: () => app, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const source = (await fs.readFile(new URL('../site/app.js', import.meta.url), 'utf8'))
    .replace(/^import\s+[\s\S]*?\sfrom\s+['"][^'"]+['"];\n/gm, '');
  const context = {
    document, console, URLSearchParams,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
    location: { search, reload: () => { reloads++; } },
    window: { setTimeout: (fn, delay) => { timers.push({ fn, delay }); }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    readingDate: (value = now) => readingDate(value), millisecondsUntilReadingDay,
    selectEntry, textEl: (tag, cls, text) => ({ tag, cls, text }),
    removeHomeChrome() {}, setReaderHeader() {}, installHomeChrome() {}, announceMissingDate() {},
    renderHero: (doc) => ({ hero: doc.date }), createDateAnchor: () => ({}),
    renderReaderSections: () => [], renderEvidenceActions: () => ({}), renderArchive() {},
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => url.includes('index.json') ? index
        : { date: url.includes('mon') ? '2026-09-07' : '2026-09-08', status: 'ok', sections: {} } };
    },
  };
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { app, document, listeners, timers, requests, setTime: (time) => { now = new Date(time); }, reloads: () => reloads };
}

test('home uses Monday at Tuesday 03:00 then reloads at the reading-day boundary', async () => {
  const page = await boot();
  assert.ok(page.requests.includes('./content/mon.json'));
  assert.equal(page.timers[0].delay, 3600050);
  page.listeners.focus();
  assert.equal(page.reloads(), 0);
  page.setTime('2026-09-08T04:00:00+09:00');
  page.timers[0].fn();
  assert.equal(page.reloads(), 1);
});

test('background tabs defer rollover until visible; BFCache pageshow also checks', async () => {
  const page = await boot();
  page.setTime('2026-09-08T05:00:00+09:00');
  page.document.visibilityState = 'hidden';
  page.timers[0].fn();
  assert.equal(page.reloads(), 0);
  page.document.visibilityState = 'visible';
  page.listeners.visibilitychange();
  assert.equal(page.reloads(), 1);
  page.listeners.pageshow();
  assert.equal(page.reloads(), 2);
});

test('explicit Tuesday link before 04:00 loads Tuesday without any rollover listener', async () => {
  const page = await boot({ search: '?date=2026-09-08' });
  assert.ok(page.requests.includes('./content/tue.json'));
  assert.equal(page.timers.length, 0);
  assert.deepEqual(Object.keys(page.listeners), []);
});

test('future-only index renders a preparation message, not a null-entry exception', async () => {
  const page = await boot({ index: [{ date: '2026-09-09', path: 'future.json' }] });
  assert.equal(page.requests.length, 1);
  assert.match(page.app.nodes[0].text, /준비되지 않았습니다/);
});
