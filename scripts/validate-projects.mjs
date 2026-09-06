import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateBook } from './project-books.mjs';
import { allowedSourceUrl } from './project-http.mjs';
import { PROVIDERS } from './project-sources.mjs';
import { STATUS_LABELS } from './project-enrichment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(await fs.readFile(path.join(root, 'content/index.json'), 'utf8'));
let count = 0;
for (const entry of index) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error('Invalid index date');
  const doc = JSON.parse(await fs.readFile(path.join(root, 'content', entry.date.slice(0,4), entry.date.slice(5,7), entry.date + '.json'), 'utf8'));
  const states = doc.sections?.projectPerspectives;
  if (!states) continue; // Legacy records remain compatible, not falsely verified.
  for (const provider of PROVIDERS) {
    const state = states[provider];
    const fail = message => { throw new Error(`${doc.date} ${provider}: ${message}`); };
    if (!state || state.provider !== provider || !STATUS_LABELS[state.status]) fail('invalid source state');
    if (state.passage !== doc.passage || state.book !== locateBook(doc.passage)?.ko) fail('source passage/book mismatch');
    if (!Number.isFinite(Date.parse(state.checkedAt))) fail('missing retrieval timestamp');
    if (!Array.isArray(state.sources) || state.text) fail('invalid public evidence metadata');
    if (!['ready','not_applicable','missing_api_key','failed'].includes(state.summaryStatus)) fail('invalid summary state');
    for (const source of state.sources) {
      const hosts = provider === 'bibleproject' ? ['bibleproject.com','www.bibleproject.com'] : ['youtube.com','www.youtube.com'];
      if (!allowedSourceUrl(source.url, hosts) || source.evidenceLevel !== 'direct') fail('invalid source URL/level');
      if (provider === 'bibleproject' && source.contentKind !== 'article') fail('expected official article');
      if (provider === 'readingjesus' && (!/^UC[\w-]{22}$/.test(source.channelId || '') || source.channelId !== state.channelId)) fail('unverified video channel');
      if (provider === 'readingjesus' && !['transcript','video_metadata'].includes(source.contentKind)) fail('invalid video evidence kind');
    }
    if (state.summaryStatus === 'ready') {
      if (state.status !== 'ready' || typeof state.summary !== 'string' || state.summary.length < 60 || state.summary.length > 1000 || !/^[\da-f]{64}$/.test(state.evidenceHash || '')) fail('invalid summary provenance');
      if (!state.sources.length || state.sources.some(s => s.contentKind === 'video_metadata')) fail('metadata cannot substantiate a perspective');
      if (!Array.isArray(state.evidenceQuotes) || state.evidenceQuotes.length < 1 || state.evidenceQuotes.length > 2 || state.evidenceQuotes.some(q => typeof q !== 'string' || q.length < 20 || q.length > 180) || state.evidenceQuotes.join('').length > 300) fail('missing/bounded supporting excerpts');
    } else if (state.summary) fail('unverified summary must not be published');
    count++;
  }
}
console.log(`Project validation OK: ${count} source state(s)`);
