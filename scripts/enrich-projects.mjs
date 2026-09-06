import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCachedCollector, enrichDocument, supplementMarkdown } from './project-enrichment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = args.find(x => x.startsWith('--date=') || x.startsWith('--dates='));
if (!arg || args.some(x => x !== arg && x !== '--force')) throw new Error('Usage: node scripts/enrich-projects.mjs --dates=YYYY-MM-DD[,YYYY-MM-DD] [--force]');
const dates = [...new Set(arg.slice(arg.indexOf('=') + 1).split(','))];
if (!dates.length || dates.length > 31) throw new Error('Specify 1–31 explicit dates.');
for (const date of dates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date.');
}
const collect = createCachedCollector({ directory: path.join(root, '.cache', 'project-sources') });
const pending = [];
for (const date of dates) {
  const stem = path.join(root, 'content', date.slice(0,4), date.slice(5,7), date);
  const jsonBefore = await fs.readFile(stem + '.json', 'utf8');
  const mdBefore = await fs.readFile(stem + '.md', 'utf8');
  const doc = JSON.parse(jsonBefore);
  if (doc.date !== date) throw new Error('Document date mismatch.');
  const next = await enrichDocument(doc, { collect, force: args.includes('--force') });
  for (const [provider, state] of Object.entries(next.sections?.projectPerspectives || {})) {
    console.log(`${date} ${provider}: source=${state.status}; summary=${state.summaryStatus}; searchConfigured=${Boolean(state.searchConfigured)}`);
    for (const attempt of state.summaryAttempts || []) console.log(`  summary ${attempt.model}: ${attempt.outcome}`);
    for (const attempt of state.attempts || []) console.log(`  ${attempt.outcome}: ${attempt.url}`);
  }
  if (next === doc) continue;
  const protectedSnapshot = value => {
    const copy = structuredClone(value);
    delete copy.sections.projectPerspectives;
    delete copy.projectEnrichedAt;
    if (copy.evidenceMeta) { delete copy.evidenceMeta.projectSources; if (!Object.keys(copy.evidenceMeta).length) delete copy.evidenceMeta; }
    delete copy.sources;
    return JSON.stringify(copy);
  };
  if (protectedSnapshot(doc) !== protectedSnapshot(next)
    || JSON.stringify(next.sources.slice(0, doc.sources?.length || 0)) !== JSON.stringify(doc.sources || [])) {
    throw new Error('Protected QT content changed; refusing to publish.');
  }
  pending.push({ stem, jsonBefore, mdBefore, json: JSON.stringify(next, null, 2) + '\n', md: supplementMarkdown(mdBefore, next.sections.projectPerspectives) });
}
// Optimistic check before any writes. This command never regenerates or edits the index.
for (const item of pending) {
  if (await fs.readFile(item.stem + '.json', 'utf8') !== item.jsonBefore || await fs.readFile(item.stem + '.md', 'utf8') !== item.mdBefore) throw new Error('Content changed concurrently; refusing to overwrite.');
}
for (const item of pending) {
  await fs.writeFile(item.stem + '.json.tmp', item.json, 'utf8');
  await fs.writeFile(item.stem + '.md.tmp', item.md, 'utf8');
  await fs.rename(item.stem + '.json.tmp', item.stem + '.json');
  await fs.rename(item.stem + '.md.tmp', item.stem + '.md');
}
console.log(`Project supplementation complete: ${pending.length}/${dates.length} record(s) changed; existing QT sections and verification preserved.`);
