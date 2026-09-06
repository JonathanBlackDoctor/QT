import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  assertDate,
  contentPaths,
  isWhitelistedUrl,
  parseArgs,
  readJson,
} from './lib.mjs';

const args = parseArgs();
const indexPath = path.join(ROOT, 'content', 'index.json');
const index = await readJson(indexPath);
if (!Array.isArray(index)) fail('content/index.json must be an array');

const dates = args.date ? [assertDate(args.date)] : index.map(x => x.date);
const seen = new Set();
for (const entry of index) {
  if (!entry?.date || seen.has(entry.date)) fail(`Duplicate/invalid index date: ${entry?.date}`);
  seen.add(entry.date);
  assertDate(entry.date);
}

for (const date of dates) {
  const p = contentPaths(date);
  let doc;
  try { doc = await readJson(p.json); }
  catch (e) { fail(`Missing/invalid content JSON for ${date}: ${e.message}`); }

  if (doc.date !== date) fail(`${date}: document date mismatch (${doc.date})`);
  if (!['ok','failed'].includes(doc.status)) fail(`${date}: invalid status ${doc.status}`);
  if (!doc.verification?.overall) fail(`${date}: missing verification status`);

  if (doc.status === 'ok') {
    if (!doc.passage) fail(`${date}: missing passage`);
    if (!doc.sections?.summary || !doc.sections?.commentary || !doc.sections?.christological) {
      fail(`${date}: required sections are missing`);
    }
    if (!Array.isArray(doc.sections.questions) || doc.sections.questions.length !== 3) {
      fail(`${date}: exactly 3 questions required`);
    }
    if (!Array.isArray(doc.sections.lifeApplication) || doc.sections.lifeApplication.length !== 4) {
      fail(`${date}: exactly 4 life-application areas required`);
    }
  } else if (!doc.failureMessage) {
    fail(`${date}: failed record must contain failureMessage`);
  }

  for (const source of doc.sources ?? []) {
    if (!isWhitelistedUrl(source.url)) fail(`${date}: non-whitelisted source ${source.url}`);
    if (!['direct','search_snippet'].includes(source.evidenceLevel)) {
      fail(`${date}: invalid evidence level ${source.evidenceLevel}`);
    }
  }

  const idx = index.find(x => x.date === date);
  if (!idx) fail(`${date}: missing from content/index.json`);
  if (idx.status !== doc.status || idx.passage !== doc.passage) fail(`${date}: index metadata mismatch`);
}

console.log(`Validation OK: ${dates.length} QT record(s)`);

function fail(message) {
  console.error(`VALIDATION ERROR: ${message}`);
  process.exit(1);
}
