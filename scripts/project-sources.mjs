import { locateBook, mentionsBook, bibleProjectCandidates } from './project-books.mjs';
import { createHttpClient, plainText, decodeEntities, safeDiagnosticUrl, allowedSourceUrl, SourceError } from './project-http.mjs';

const BP_HOSTS = ['bibleproject.com', 'www.bibleproject.com'];
const YT_HOSTS = ['youtube.com', 'www.youtube.com'];
export const SOURCE_VERSION = 2;
export const PROVIDERS = ['bibleproject', 'readingjesus'];
export const PROVIDER_NAMES = { bibleproject: '바이블프로젝트', readingjesus: '리딩지저스' };

export function assignedJson(html, name) {
  const pattern = new RegExp(`(?:var\\s+)?${name}\\s*=\\s*|window\\["${name}"\\]\\s*=\\s*`, 'g');
  for (const match of html.matchAll(pattern)) {
    const start = match.index + match[0].length;
    if (html[start] !== '{') continue;
    let depth = 0, quoted = false, escape = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quoted) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

function walk(root, visit) {
  const queue = [root]; let count = 0;
  while (queue.length && count++ < 50000) {
    const node = queue.pop();
    if (!node || typeof node !== 'object') continue;
    visit(node);
    queue.push(...Object.values(node).filter(x => x && typeof x === 'object'));
  }
}
function ytText(node) { return node?.simpleText || node?.runs?.map(x => x.text || '').join('') || ''; }

export function parseBibleProject(html, book) {
  const title = plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const h1 = plainText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!mentionsBook(`${title} ${h1}`, book)) return null;
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
  const clean = main.replace(/<(nav|header|footer|script|style|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const paragraphs = [...clean.matchAll(/<(?:p|h2|h3)\b[^>]*>([\s\S]*?)<\/(?:p|h2|h3)>/gi)]
    .map(m => plainText(m[1])).filter(p => p.length >= 30 && !/cookie|newsletter|privacy policy|sign up|donate now/i.test(p));
  const text = [...new Set(paragraphs)].join('\n\n').slice(0, 16000);
  if (text.length < 350 || !mentionsBook(text, book)) return null;
  return { title: h1 || title, text };
}

export function channelIdentity(html, expectedId = '') {
  const data = assignedJson(html, 'ytInitialData'); let found = null;
  walk(data, node => {
    const m = node.channelMetadataRenderer;
    if (!m || !/^UC[\w-]{22}$/.test(m.externalId || '')) return;
    const aliases = [m.vanityChannelUrl, ...(m.ownerUrls || [])];
    const match = aliases.some(url => {
      try { const u = new URL(url); return YT_HOSTS.includes(u.hostname) && u.pathname.toLowerCase().replace(/\/$/, '') === '/@readingjesus'; } catch { return false; }
    });
    if (match && (!expectedId || m.externalId === expectedId)) found = { id: m.externalId, title: m.title || '리딩지저스' };
  });
  return found;
}

export function videoCandidates(html, book) {
  const out = []; const seen = new Set();
  walk(assignedJson(html, 'ytInitialData'), node => {
    const v = node.videoRenderer || node.gridVideoRenderer;
    if (!v || !/^[\w-]{11}$/.test(v.videoId || '') || seen.has(v.videoId)) return;
    const title = ytText(v.title);
    if (!mentionsBook(title, book)) return;
    seen.add(v.videoId); out.push({ id: v.videoId, title });
  });
  const score = v => /개관|개요|강의|해설|overview|lecture/i.test(v.title) ? 10 : /낭독|장별 성경읽기|오디오/i.test(v.title) ? -10 : 0;
  return out.sort((a,b) => score(b) - score(a)).slice(0, 8);
}

export function verifiedVideoMetadata(raw, identity, book) {
  try {
    const metadata = JSON.parse(raw);
    const author = new URL(metadata.author_url);
    const ownerPath = author.pathname.replace(/\/$/, '');
    const ownerMatches = ownerPath.toLowerCase() === '/@readingjesus' || ownerPath === `/channel/${identity.id}`;
    if (!allowedSourceUrl(author.href, YT_HOSTS) || !ownerMatches || !mentionsBook(metadata.title, book)) return null;
    return { title: String(metadata.title), channelId: identity.id };
  } catch { return null; }
}

export function parseCaptions(raw) {
  if (/^\s*[{[]/.test(raw)) {
    try { return JSON.parse(raw).events?.flatMap(e => e.segs?.map(s => s.utf8 || '') || []).join(' ').replace(/\s+/g, ' ').trim() || ''; } catch { return ''; }
  }
  if (/<html\b/i.test(raw) || !/<(?:transcript|timedtext)\b/i.test(raw)) return '';
  return plainText(raw).replace(/\s+/g, ' ').trim();
}

export function createProjectCollector({ request = createHttpClient(), env = process.env, now = () => new Date().toISOString() } = {}) {
  const searchKey = env.GOOGLE_CSE_API_KEY?.trim();
  const searchId = env.GOOGLE_CSE_ID?.trim();
  const searchConfigured = Boolean(searchKey && searchId);

  const base = (provider, book) => ({ provider, label: PROVIDER_NAMES[provider], version: SOURCE_VERSION,
    book: book?.ko || null, scope: 'book', status: 'not_found', reason: '관련 자료를 찾지 못했습니다.',
    checkedAt: now(), searchConfigured, attempts: [], sources: [], text: null });

  async function open(url, hosts, result) {
    try {
      const doc = await request(url, { hosts });
      result.attempts.push({ url: safeDiagnosticUrl(url), outcome: 'ok' });
      return doc;
    } catch (error) {
      result.attempts.push({ url: safeDiagnosticUrl(url), outcome: error instanceof SourceError ? error.code : 'network_error' });
      return null;
    }
  }

  async function search(query, result) {
    if (!searchConfigured) return [];
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.search = new URLSearchParams({ key: searchKey, cx: searchId, q: query, num: '5' }).toString();
    const doc = await open(url.href, ['www.googleapis.com'], result);
    if (!doc) return [];
    try { return JSON.parse(doc.text).items || []; } catch { result.attempts.push({ url: 'Google CSE', outcome: 'invalid_json' }); return []; }
  }

  function noContent(result, reason) {
    const errors = result.attempts.filter(x => x.outcome !== 'ok' && x.outcome !== 'http_404');
    result.status = errors.length ? 'fetch_failed' : 'not_found';
    result.reason = reason + (searchConfigured ? '' : ' 검색 보완 설정은 연결되지 않았습니다.');
    return result;
  }

  async function bibleproject(book) {
    const result = base('bibleproject', book);
    const candidates = bibleProjectCandidates(book);
    const seen = new Set();
    async function tryUrls(urls) {
      for (const url of urls) {
        if (!allowedSourceUrl(url, BP_HOSTS) || seen.has(url)) continue;
        seen.add(url);
        const doc = await open(url, BP_HOSTS, result);
        const article = doc && parseBibleProject(doc.text, book);
        if (!article) continue;
        Object.assign(result, { status: 'ready', reason: '공식 책 해설 본문을 직접 확보했습니다.', text: article.text,
          sources: [{ url: doc.url, title: article.title, evidenceLevel: 'direct', contentKind: 'article' }] });
        return true;
      }
      return false;
    }
    if (await tryUrls(candidates)) return result;
    for (const query of [`site:bibleproject.com ${book.en} overview`, `site:bibleproject.com ${book.ko}`]) {
      const items = await search(query, result);
      if (await tryUrls(items.filter(x => mentionsBook(x.title, book)).map(x => x.link).slice(0, 3))) return result;
    }
    return noContent(result, '공식 페이지에서 해당 책의 해설 본문을 확보하지 못했습니다.');
  }

  async function readingjesus(book) {
    const result = base('readingjesus', book);
    const channelUrl = 'https://www.youtube.com/@readingjesus';
    const channelDoc = await open(channelUrl, YT_HOSTS, result);
    if (!channelDoc) return noContent(result, '리딩지저스 공식 채널에 접속하지 못했습니다.');
    const identity = channelIdentity(channelDoc.text, env.READING_JESUS_CHANNEL_ID?.trim() || '');
    if (!identity) {
      result.status = 'identity_unverified';
      result.reason = '공식 @readingjesus 채널의 ID를 검증하지 못해 다른 채널의 자료는 사용하지 않았습니다.';
      return result;
    }
    result.channelId = identity.id;
    const searchDoc = await open(`${channelUrl}/search?query=${encodeURIComponent(book.ko)}`, YT_HOSTS, result);
    const candidates = [...videoCandidates(searchDoc?.text || '', book), ...videoCandidates(channelDoc.text, book)];
    if (!candidates.length) {
      const items = await search(`리딩지저스 ${book.ko} site:youtube.com/watch`, result);
      for (const item of items) {
        try { const u = new URL(item.link); const id = u.searchParams.get('v');
          if (allowedSourceUrl(u.href, YT_HOSTS) && u.pathname === '/watch' && /^[\w-]{11}$/.test(id || '') && mentionsBook(item.title, book)) candidates.push({ id, title: item.title });
        } catch {}
      }
    }
    const unique = [...new Map(candidates.map(v => [v.id, v])).values()].slice(0, 3);
    for (const candidate of unique) {
      const watchUrl = `https://www.youtube.com/watch?v=${candidate.id}`;
      const watch = await open(watchUrl, YT_HOSTS, result);
      const player = watch && assignedJson(watch.text, 'ytInitialPlayerResponse');
      const playback = player?.playabilityStatus?.status;
      if (playback && playback !== 'OK') result.attempts.push({ url: safeDiagnosticUrl(watchUrl), outcome: `playback_${String(playback).toLowerCase().replace(/[^a-z_]/g, '')}` });
      let detail = player?.videoDetails;
      const hasPlayerMetadata = Boolean(detail);
      if (!detail) {
        result.attempts.push({ url: safeDiagnosticUrl(watchUrl), outcome: 'player_metadata_unavailable' });
        // Public title/author metadata is not a substitute for gated playback or captions.
        const oembed = await open(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, YT_HOSTS, result);
        const metadata = oembed && verifiedVideoMetadata(oembed.text, identity, book);
        if (!metadata) continue;
        detail = { ...metadata, videoId: candidate.id, shortDescription: '' };
      }
      if (detail.channelId !== identity.id || detail.videoId !== candidate.id || !mentionsBook(detail.title, book)) {
        result.attempts.push({ url: safeDiagnosticUrl(watchUrl), outcome: 'video_identity_mismatch' });
        continue;
      }
      const metadataFields = detail.shortDescription ? ['title','channel','description'] : ['title','channel'];
      const source = { url: watchUrl, title: detail.title, evidenceLevel: 'direct', contentKind: 'video_metadata', channelId: identity.id, metadataFields };
      if (!result.sources.length) {
        result.sources = [source]; result.status = 'metadata_only';
        result.description = String(detail.shortDescription || '').slice(0, 700);
        result.reason = detail.shortDescription ? '공식 영상의 제목·채널·설명만 확보했습니다. 영상 내용을 추측해 관점을 작성하지 않습니다.' : '공식 영상의 제목·채널 정보만 확인했습니다. 자막을 확보하지 못해 해설을 추측하지 않습니다.';
      }
      if (!hasPlayerMetadata || (playback && playback !== 'OK')) continue;
      if (/낭독|장별 성경읽기|오디오/i.test(detail.title) && !/개관|개요|강의|해설/i.test(detail.title)) continue;
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const sorted = tracks.filter(t => ['ko','en'].includes(t.languageCode))
        .sort((a,b) => (a.kind === 'asr' ? 5 : 0) - (b.kind === 'asr' ? 5 : 0) + (a.languageCode === 'ko' ? -1 : 1) - (b.languageCode === 'ko' ? -1 : 1));
      for (const track of sorted.slice(0, 2)) {
        if (!allowedSourceUrl(track.baseUrl, YT_HOSTS)) continue;
        const captionUrl = new URL(track.baseUrl);
        if (captionUrl.pathname !== '/api/timedtext') continue;
        captionUrl.searchParams.set('fmt', 'json3');
        const caption = await open(captionUrl.href, YT_HOSTS, result);
        const transcript = caption && parseCaptions(caption.text);
        if (!transcript || transcript.length < 300) continue;
        Object.assign(result, { status: 'ready', reason: track.kind === 'asr' ? '공식 영상의 자동 자막을 확보했습니다. 인식 오류 가능성이 있습니다.' : '공식 영상에서 제공하는 자막을 직접 확보했습니다.',
          text: transcript.slice(0, 30000), sources: [{ ...source, contentKind: 'transcript', language: track.languageCode, automaticCaptions: track.kind === 'asr' }] });
        return result;
      }
    }
    if (result.status === 'metadata_only') return result;
    return noContent(result, '해당 책과 관련되고 공식 채널 ID가 일치하는 영상을 확보하지 못했습니다.');
  }

  return async function collect(passage, provider) {
    if (!PROVIDERS.includes(provider)) throw new Error('Unknown project provider');
    const book = locateBook(passage);
    if (!book) return { ...base(provider, book), status: 'unsupported_book', reason: '본문의 성경 책 이름을 식별하지 못했습니다.' };
    return provider === 'bibleproject' ? bibleproject(book) : readingjesus(book);
  };
}
