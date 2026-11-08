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
  const passageReady = doc?.date === date && typeof doc.passage === 'string'
    && Boolean(doc.passage.trim());
  const fullReady = passageReady && doc.status === 'ok'
    && ['summary', 'commentary', 'christological'].every((key) =>
      typeof doc.sections?.[key] === 'string' && Boolean(doc.sections[key].trim()));
  const sourceOnlyReady = passageReady && doc.status === 'limited'
    && doc.generationMode === 'verified_source_only'
    && doc.verification?.date === '직접 확인'
    && doc.verification?.passage === '직접 확인'
    && typeof doc.notice === 'string' && Boolean(doc.notice.trim())
    && typeof doc.sections?.summary === 'string' && Boolean(doc.sections.summary.trim())
    && Array.isArray(doc.sections?.questions) && doc.sections.questions.length === 3
    && Array.isArray(doc.sections?.lifeApplication) && doc.sections.lifeApplication.length === 4
    && Array.isArray(doc.sources) && doc.sources.some(s => s.evidenceLevel === 'direct'
      && /^https:\/\/sum\.su\.or\.kr(?::\d+)?\//.test(s.url));
  const documentReady = Boolean(fullReady || sourceOnlyReady);
  const indexReady = entry?.status === doc?.status && entry?.path === expectedPath;
  const ready = Boolean(documentReady && indexReady);
  return {
    date,
    ready,
    // A verified reading guide can be published without AI-generated commentary.
    aiReady: Boolean(fullReady && indexReady),
    quality: fullReady && indexReady ? 'full' : sourceOnlyReady && indexReady ? 'limited' : 'incomplete',
    reason: ready ? 'ready' : !doc ? 'missing_or_unreadable_document'
      : !documentReady ? 'failed_or_incomplete_document' : 'missing_or_invalid_index_entry',
    // The existing generator skips status=ok. Force repair only for inconsistent records.
    repair: !ready && doc?.status === 'ok',
  };
}

// Retry limited records deliberately instead of declaring their AI work complete
// or calling blocked model providers on every hourly publication check.
export function requiredWork(state, {
  forced = false, retryLimitedAi = false, retryPerspectives = false, published = true,
} = {}) {
  const retryLimited = retryLimitedAi && state.ready && !state.aiReady;
  const needsGeneration = forced || !state.ready || retryLimited;
  const needsEnrichment = needsGeneration || retryPerspectives;
  return {
    needsGeneration,
    needsEnrichment,
    needsDeployment: needsEnrichment || !published,
    forceGeneration: forced || state.repair,
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
  const retryPerspectives = process.env.RETRY_PERSPECTIVES === 'true';
  const retryLimitedAi = process.env.RETRY_LIMITED_AI === 'true';
  const requireReady = process.argv.includes('--require-ready');
  const requireFull = process.argv.includes('--require-full');
  const baseUrl = process.env.PAGES_BASE_URL;
  let published = !baseUrl;
  if (baseUrl && state.ready) {
    for (let attempt = 0; attempt < (requireReady || requireFull ? 3 : 1); attempt++) {
      published = await inspectPublication(date, ROOT, baseUrl);
      if (published) break;
      if ((requireReady || requireFull) && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  const work = requiredWork(state, { forced, retryLimitedAi, retryPerspectives, published });
  console.log(JSON.stringify({ ...state, published, ...work, checkedAt: new Date().toISOString(), event: process.env.GITHUB_EVENT_NAME || 'local' }));
  if (!requireReady && !requireFull && process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT,
      `date=${date}\nneeds_generation=${work.needsGeneration}\nforce_generation=${work.forceGeneration}\nneeds_enrichment=${work.needsEnrichment}\nneeds_deployment=${work.needsDeployment}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\n### QT readiness: ${date}\n- Checked: ${new Date().toISOString()}\n- Content: ${state.reason}\n- AI commentary: ${state.quality === 'full' ? 'ready' : state.quality === 'limited' ? 'unavailable (verified-source-only)' : 'missing'}\n- Published match: ${baseUrl ? published : 'not checked'}\n- Generation: KST calendar day; homepage rollover: 04:00 KST.\n`);
  }
  if ((requireReady && (!state.ready || !published)) ||
      (requireFull && (!state.aiReady || !published))) {
    console.error(`::error::QT ${date} is not ${requireFull ? 'AI-complete' : 'publishable'} (${state.quality}, published=${published}).`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
