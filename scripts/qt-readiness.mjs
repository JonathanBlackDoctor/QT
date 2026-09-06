import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function generationDate(now = new Date()) {
  // Generation keeps the KST calendar date, independent of the reader's 04:00 boundary.
  return new Date(new Date(now).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function checkedDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return date;
}

export function contentReadiness(doc, index, date) {
  checkedDate(date);
  const expectedPath = `${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`;
  const entry = Array.isArray(index) ? index.find((item) => item?.date === date) : null;
  const documentReady = doc?.date === date && doc?.status === 'ok'
    && typeof doc.passage === 'string' && Boolean(doc.passage.trim())
    && ['summary', 'commentary', 'christological'].every((key) =>
      typeof doc.sections?.[key] === 'string' && Boolean(doc.sections[key].trim()));
  const indexReady = entry?.status === 'ok' && entry?.path === expectedPath;
  const ready = Boolean(documentReady && indexReady);
  return {
    date,
    ready,
    reason: ready ? 'ready' : !doc ? 'missing_or_unreadable_document'
      : !documentReady ? 'failed_or_incomplete_document' : 'missing_or_invalid_index_entry',
    // The existing generator skips status=ok. Force repair only for inconsistent records.
    repair: !ready && doc?.status === 'ok',
  };
}

export async function inspectReadiness(date, root = ROOT) {
  checkedDate(date);
  const read = async (file) => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const [doc, index] = await Promise.all([
    read(path.join(root, 'content', date.slice(0, 4), date.slice(5, 7), `${date}.json`)),
    read(path.join(root, 'content', 'index.json')),
  ]);
  return contentReadiness(doc, index, date);
}

export async function inspectPublication(date, root, baseUrl, fetcher = fetch) {
  checkedDate(date);
  try {
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const datedPath = `content/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`;
    const localDoc = JSON.parse(await fs.readFile(path.join(root, datedPath), 'utf8'));
    const get = async (relative) => {
      const url = new URL(relative, base);
      url.searchParams.set('qt-check', String(Date.now()));
      const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Published content HTTP ${response.status}`);
      return response.json();
    };
    const [remoteDoc, remoteIndex] = await Promise.all([get(datedPath), get('content/index.json')]);
    return contentReadiness(remoteDoc, remoteIndex, date).ready
      && JSON.stringify(remoteDoc) === JSON.stringify(localDoc);
  } catch { return false; } // Network or stale deployment -> retry publication, not the model.
}

async function main() {
  const date = checkedDate(process.env.REQUESTED_DATE?.trim() || generationDate());
  const state = await inspectReadiness(date);
  const forced = process.env.FORCE_GENERATION === 'true';
  const needsEnrichment = forced || !state.ready || process.env.RETRY_PERSPECTIVES === 'true';
  const requireReady = process.argv.includes('--require-ready');
  const baseUrl = process.env.PAGES_BASE_URL;
  let published = !baseUrl;
  if (baseUrl && state.ready) {
    for (let attempt = 0; attempt < (requireReady ? 3 : 1); attempt++) {
      published = await inspectPublication(date, ROOT, baseUrl);
      if (published) break;
      if (requireReady && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  console.log(JSON.stringify({ ...state, published, checkedAt: new Date().toISOString(), event: process.env.GITHUB_EVENT_NAME || 'local' }));
  if (!requireReady && process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT,
      `date=${date}\nneeds_generation=${forced || !state.ready}\nforce_generation=${forced || state.repair}\nneeds_enrichment=${needsEnrichment}\nneeds_deployment=${needsEnrichment || !published}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\n### QT readiness: ${date}\n- Checked: ${new Date().toISOString()}\n- Content: ${state.reason}\n- Published match: ${baseUrl ? published : 'not checked'}\n- Generation: KST calendar day; homepage rollover: 04:00 KST.\n`);
  }
  if (requireReady && (!state.ready || !published)) {
    console.error(`::error::QT ${date} is not ready (${state.reason}, published=${published}). A failure record is not successful publication.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
