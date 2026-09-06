import {
  SU_TODAY_URL,
  canonicalHost,
  extractPassages,
  fetchText,
  isWhitelistedUrl,
  pageMentionsDate,
} from './lib.mjs';

const SOURCE_LABELS = {
  'sum.su.or.kr': '성서유니온 매일성경',
  'su.or.kr': '성서유니온',
  'duranno.com': '두란노',
  'bibleproject.com': 'BibleProject',
  'youtube.com': 'YouTube',
  'bskorea.or.kr': '대한성서공회',
  'biblehub.com': 'BibleHub',
  'blueletterbible.org': 'Blue Letter Bible',
  'netbible.org': 'NET Bible',
  'thegospelcoalition.org': 'The Gospel Coalition',
  'desiringgod.org': 'Desiring God',
  'enduringword.com': 'Enduring Word',
};

function labelFor(url) {
  return SOURCE_LABELS[canonicalHost(url)] ?? canonicalHost(url);
}

function compact(text, max = 14000) {
  return text.replace(/\u0000/g, '').slice(0, max);
}

function hasCommentarySignals(text) {
  return /(해설|묵상|적용|기도|오늘의 말씀|말씀을 묵상)/.test(text);
}

function isOfficialSuUrl(url) {
  const host = canonicalHost(url);
  return host === 'sum.su.or.kr' || host === 'su.or.kr';
}

async function tryOfficialDateNavigation(initialDoc, targetDate) {
  const links = Array.isArray(initialDoc.links) ? initialDoc.links : [];
  const candidates = links
    .filter(l => isOfficialSuUrl(l.href))
    .filter(l => pageMentionsDate(`${l.text ?? ''} ${l.href}`, targetDate))
    .slice(0, 4);

  for (const link of candidates) {
    try {
      const doc = await fetchText(link.href, { maxChars: 22000 });
      if (!isOfficialSuUrl(doc.url)) continue;
      if (!pageMentionsDate(doc.text, targetDate)) continue;
      return { doc, via: link.href };
    } catch {}
  }
  return null;
}

export async function googleSearch(query, { num = 5 } = {}) {
  const key = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_ID?.trim();
  if (!key || !cx) return { available: false, query, items: [] };

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.min(Math.max(num, 1), 10)));

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Google CSE failed: HTTP ${res.status}`);
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];
  return {
    available: true,
    query,
    items: items.map((i) => ({
      title: String(i.title ?? ''),
      url: String(i.link ?? ''),
      snippet: String(i.snippet ?? ''),
      displayLink: String(i.displayLink ?? ''),
    })),
  };
}

async function safeOpen(url, maxChars = 14000) {
  if (!isWhitelistedUrl(url)) return null;
  try {
    const doc = await fetchText(url, { maxChars });
    if (!isWhitelistedUrl(doc.url)) return null;
    return {
      source: labelFor(doc.url),
      url: doc.url,
      title: doc.title,
      evidenceLevel: 'direct',
      text: compact(doc.text, maxChars),
    };
  } catch (error) {
    return { error: String(error?.message ?? error), url };
  }
}

async function fallbackForPassage(targetDate) {
  const [y, m, d] = targetDate.split('-');
  const mi = String(Number(m));
  const di = String(Number(d));
  const queries = [
    `"매일성경" "${y}년 ${mi}월 ${di}일"`,
    `"매일성경" "${mi}월 ${di}일" 본문`,
    `"성서유니온" "${targetDate}" 큐티`,
    `site:sum.su.or.kr ${targetDate}`,
    `site:su.or.kr "${mi}월 ${di}일" "오늘의 말씀"`,
  ];

  const snippets = [];
  const opened = [];
  let passage = null;

  for (const query of queries) {
    const result = await googleSearch(query, { num: 5 });
    if (!result.available) break;
    for (const item of result.items) {
      if (!isWhitelistedUrl(item.url)) continue;
      const host = canonicalHost(item.url);
      if (host !== 'sum.su.or.kr' && host !== 'su.or.kr') continue;
      const ev = {
        source: labelFor(item.url),
        url: item.url,
        title: item.title,
        snippet: item.snippet.slice(0, 1000),
        evidenceLevel: 'search_snippet',
        query,
      };
      snippets.push(ev);
      const ps = extractPassages(`${item.title}\n${item.snippet}`);
      if (!passage && ps.length) passage = ps[0];

      const direct = await safeOpen(item.url, 18000);
      if (direct && !direct.error) {
        direct.query = query;
        direct.dateMatch = pageMentionsDate(direct.text, targetDate);
        direct.passageCandidates = extractPassages(direct.text).slice(0, 12);
        opened.push(direct);
        if (!passage && direct.dateMatch && direct.passageCandidates.length) passage = direct.passageCandidates[0];
      }
      if (passage) break;
    }
    if (passage) break;
  }

  return { passage, snippets, opened, searchAvailable: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID) };
}

async function researchPassage(passage) {
  if (!passage || !process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_ID) return [];
  const queries = [
    `"${passage}" site:bskorea.or.kr`,
    `"${passage}" site:bibleproject.com`,
    `"${passage}" site:biblehub.com`,
    `"${passage}" site:blueletterbible.org`,
    `"${passage}" site:netbible.org`,
    `"${passage}" site:thegospelcoalition.org OR site:enduringword.com OR site:desiringgod.org`,
  ];

  const docs = [];
  const seenHosts = new Set();
  for (const query of queries) {
    if (docs.length >= 4) break;
    let result;
    try { result = await googleSearch(query, { num: 4 }); } catch { continue; }
    for (const item of result.items) {
      if (!isWhitelistedUrl(item.url)) continue;
      const host = canonicalHost(item.url);
      if (host === 'sum.su.or.kr' || host === 'su.or.kr' || seenHosts.has(host)) continue;
      const direct = await safeOpen(item.url, 12000);
      if (direct && !direct.error && direct.text.length >= 200) {
        docs.push({ ...direct, query, discoveredBy: 'google_cse' });
        seenHosts.add(host);
        break;
      }
    }
  }
  return docs;
}

export async function collectEvidence(targetDate) {
  const retrievedAt = new Date().toISOString();
  const evidence = {
    targetDate,
    retrievedAt,
    su: {
      primaryUrl: SU_TODAY_URL,
      directAttempted: true,
      directSucceeded: false,
      directError: null,
      dateNavigationTried: false,
      dateStatus: '확인 실패',
      passageStatus: '확인 실패',
      titleStatus: '확인 실패',
      commentaryStatus: '확인 실패',
      directDocument: null,
      fallbackSnippets: [],
      fallbackDocuments: [],
    },
    passage: null,
    researchDocuments: [],
  };

  try {
    const initial = await fetchText(SU_TODAY_URL, { maxChars: 22000 });
    if (!isOfficialSuUrl(initial.url)) {
      throw new Error(`Official page redirected outside allowed SU domains: ${initial.url}`);
    }
    evidence.su.directSucceeded = true;
    let direct = initial;
    let navigationVia = null;

    if (!pageMentionsDate(initial.text, targetDate)) {
      evidence.su.dateNavigationTried = true;
      const navigated = await tryOfficialDateNavigation(initial, targetDate);
      if (navigated) {
        direct = navigated.doc;
        navigationVia = navigated.via;
      }
    }

    const dateMatch = pageMentionsDate(direct.text, targetDate);
    const passageCandidates = extractPassages(direct.text).slice(0, 12);
    evidence.su.directDocument = {
      source: labelFor(direct.url),
      url: direct.url,
      initialUrl: initial.url,
      navigationVia,
      title: direct.title,
      evidenceLevel: 'direct',
      dateMatch,
      passageCandidates,
      text: compact(direct.text, 18000),
    };
    if (dateMatch) {
      evidence.su.dateStatus = '직접 확인';
      if (passageCandidates.length) {
        evidence.passage = passageCandidates[0];
        evidence.su.passageStatus = '직접 확인';
      }
      if (hasCommentarySignals(direct.text)) evidence.su.commentaryStatus = '직접 확인';
    }
  } catch (error) {
    evidence.su.directError = String(error?.message ?? error);
  }

  if (!evidence.passage) {
    const fallback = await fallbackForPassage(targetDate);
    evidence.su.fallbackSnippets = fallback.snippets;
    evidence.su.fallbackDocuments = fallback.opened;
    if (fallback.passage) {
      evidence.passage = fallback.passage;
      const hasDirectForTarget = fallback.opened.some(d => d.dateMatch && d.passageCandidates?.includes(fallback.passage));
      evidence.su.passageStatus = hasDirectForTarget ? '직접 확인 + 검색 보완' : '검색으로만 확인';
      if (evidence.su.dateStatus === '직접 확인' && !hasDirectForTarget) {
        evidence.su.dateStatus = '직접 확인 + 검색 보완';
      } else if (evidence.su.dateStatus === '확인 실패') {
        evidence.su.dateStatus = hasDirectForTarget ? '직접 확인 + 검색 보완' : '검색으로만 확인';
      }
    }
  }

  if (evidence.passage) evidence.researchDocuments = await researchPassage(evidence.passage);
  return evidence;
}
