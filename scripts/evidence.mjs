import {
  SU_TODAY_URL,
  canonicalHost,
  extractPassages,
  fetchText,
  isWhitelistedUrl,
  pageMentionsDate,
} from './lib.mjs';

const SU_ALT_TODAY_URL = 'https://sum.su.or.kr/bible/today';

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

const BIBLEHUB_BOOK_SLUGS = {
  '창세기':'genesis','출애굽기':'exodus','레위기':'leviticus','민수기':'numbers','신명기':'deuteronomy',
  '여호수아':'joshua','사사기':'judges','룻기':'ruth','사무엘상':'1_samuel','사무엘하':'2_samuel',
  '열왕기상':'1_kings','열왕기하':'2_kings','역대상':'1_chronicles','역대하':'2_chronicles','에스라':'ezra',
  '느헤미야':'nehemiah','에스더':'esther','욥기':'job','시편':'psalms','잠언':'proverbs','전도서':'ecclesiastes',
  '아가':'songs','이사야':'isaiah','예레미야':'jeremiah','예레미야애가':'lamentations','애가':'lamentations',
  '에스겔':'ezekiel','다니엘':'daniel','호세아':'hosea','요엘':'joel','아모스':'amos','오바댜':'obadiah',
  '요나':'jonah','미가':'micah','나훔':'nahum','하박국':'habakkuk','스바냐':'zephaniah','학개':'haggai',
  '스가랴':'zechariah','말라기':'malachi','마태복음':'matthew','마가복음':'mark','누가복음':'luke',
  '요한복음':'john','사도행전':'acts','로마서':'romans','고린도전서':'1_corinthians','고린도후서':'2_corinthians',
  '갈라디아서':'galatians','에베소서':'ephesians','빌립보서':'philippians','골로새서':'colossians',
  '데살로니가전서':'1_thessalonians','데살로니가후서':'2_thessalonians','디모데전서':'1_timothy','디모데후서':'2_timothy',
  '디도서':'titus','빌레몬서':'philemon','히브리서':'hebrews','야고보서':'james','베드로전서':'1_peter',
  '베드로후서':'2_peter','요한일서':'1_john','요한이서':'2_john','요한삼서':'3_john','유다서':'jude','요한계시록':'revelation',
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

/**
 * 날짜 네비게이션 링크가 페이지 어딘가에 있다는 이유만으로 그 날짜의 본문이라고
 * 오판하지 않도록, 문서 제목·최종 URL·본문 앞부분에 실제 날짜가 나타나는지 본다.
 */
function documentMatchesDate(doc, targetDate) {
  const primaryRegion = `${doc.title ?? ''}\n${doc.url ?? ''}\n${(doc.text ?? '').slice(0, 4500)}`;
  return pageMentionsDate(primaryRegion, targetDate);
}

async function fetchOfficialLanding() {
  try {
    const doc = await fetchText(SU_TODAY_URL, { maxChars: 22000 });
    return { doc, exactPrimarySucceeded: true, attempts: [{ url: SU_TODAY_URL, ok: true }] };
  } catch (primaryError) {
    const attempts = [{ url: SU_TODAY_URL, ok: false, error: String(primaryError?.message ?? primaryError) }];
    try {
      const doc = await fetchText(SU_ALT_TODAY_URL, { maxChars: 22000 });
      attempts.push({ url: SU_ALT_TODAY_URL, ok: true, finalUrl: doc.url });
      return { doc, exactPrimarySucceeded: false, attempts };
    } catch (secondaryError) {
      attempts.push({ url: SU_ALT_TODAY_URL, ok: false, error: String(secondaryError?.message ?? secondaryError) });
      const error = new Error(`All direct SU entry points failed: ${attempts.map(a => `${a.url} => ${a.ok ? 'ok' : a.error}`).join(' | ')}`);
      error.attempts = attempts;
      throw error;
    }
  }
}

async function tryOfficialDateNavigation(initialDoc, targetDate) {
  const links = Array.isArray(initialDoc.links) ? initialDoc.links : [];
  const candidates = links
    .filter(l => isOfficialSuUrl(l.href))
    .filter(l => pageMentionsDate(`${l.text ?? ''} ${l.href}`, targetDate))
    .slice(0, 6);

  for (const link of candidates) {
    try {
      const doc = await fetchText(link.href, { maxChars: 22000 });
      if (!isOfficialSuUrl(doc.url)) continue;
      if (!documentMatchesDate(doc, targetDate)) continue;
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
        direct.dateMatch = documentMatchesDate(direct, targetDate);
        direct.passageCandidates = extractPassages(direct.text).slice(0, 12);
        opened.push(direct);
        if (!passage && direct.dateMatch && direct.passageCandidates.length) passage = direct.passageCandidates[0];
      }
      if (passage) break;
    }
    if (passage) break;
  }

  return {
    passage,
    snippets,
    opened,
    searchAvailable: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID),
  };
}

async function readingJesusMetadata(passage) {
  if (!passage || !process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_ID) return [];
  const query = `site:youtube.com/@readingjesus "${passage}"`;
  try {
    const result = await googleSearch(query, { num: 4 });
    return result.items
      .filter(item => canonicalHost(item.url) === 'youtube.com' && isWhitelistedUrl(item.url))
      .slice(0, 2)
      .map(item => ({
        source: '리딩지저스 (YouTube 검색 메타데이터)',
        url: item.url,
        title: item.title,
        snippet: item.snippet.slice(0, 1200),
        evidenceLevel: 'search_snippet',
        query,
        usageRestriction: '영상 내용 추정 금지. 제목·채널·검색에 노출된 설명 메타데이터만 사용.',
      }));
  } catch {
    return [];
  }
}

function passageLocator(passage) {
  const m = String(passage ?? '').match(/^(.+?)\s+(\d{1,3}):(\d{1,3})/);
  if (!m) return null;
  const book = m[1].trim();
  const slug = BIBLEHUB_BOOK_SLUGS[book];
  if (!slug) return null;
  return { book, slug, chapter: Number(m[2]), verse: Number(m[3]) };
}

async function deterministicResearch(passage) {
  const ref = passageLocator(passage);
  if (!ref) return [];

  const candidates = [
    {
      url: `https://biblehub.com/${ref.slug}/${ref.chapter}.htm`,
      role: 'chapter_commentary',
      maxChars: 14000,
    },
    {
      url: `https://biblehub.com/text/${ref.slug}/${ref.chapter}-${ref.verse}.htm`,
      role: 'interlinear_first_verse',
      maxChars: 10000,
    },
  ];

  const docs = [];
  for (const candidate of candidates) {
    const direct = await safeOpen(candidate.url, candidate.maxChars);
    if (!direct || direct.error || direct.text.length < 200) continue;
    docs.push({
      ...direct,
      discoveredBy: 'deterministic_url',
      role: candidate.role,
      passage,
    });
  }
  return docs;
}

async function researchPassage(passage) {
  if (!passage) return { documents: [], metadata: [] };

  const docs = await deterministicResearch(passage);
  const metadata = await readingJesusMetadata(passage);

  if (!process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_ID) {
    return { documents: docs.slice(0, 4), metadata };
  }

  const queries = [
    `"${passage}" site:bskorea.or.kr`,
    `"${passage}" site:bibleproject.com`,
    `"${passage}" site:biblehub.com`,
    `"${passage}" site:blueletterbible.org`,
    `"${passage}" site:netbible.org`,
    `"${passage}" site:thegospelcoalition.org OR site:enduringword.com OR site:desiringgod.org`,
  ];

  const seenHosts = new Set(docs.map(d => canonicalHost(d.url)));
  for (const query of queries) {
    if (docs.length >= 4) break;
    let result;
    try { result = await googleSearch(query, { num: 4 }); } catch { continue; }
    for (const item of result.items) {
      if (!isWhitelistedUrl(item.url)) continue;
      const host = canonicalHost(item.url);
      if (host === 'sum.su.or.kr' || host === 'su.or.kr' || host === 'youtube.com' || seenHosts.has(host)) continue;
      const direct = await safeOpen(item.url, 12000);
      if (direct && !direct.error && direct.text.length >= 200) {
        docs.push({ ...direct, query, discoveredBy: 'google_cse' });
        seenHosts.add(host);
        break;
      }
    }
  }

  return { documents: docs.slice(0, 4), metadata };
}

export async function collectEvidence(targetDate) {
  const retrievedAt = new Date().toISOString();
  const evidence = {
    targetDate,
    retrievedAt,
    su: {
      primaryUrl: SU_TODAY_URL,
      alternateDirectUrl: SU_ALT_TODAY_URL,
      directAttempted: true,
      directSucceeded: false,
      exactPrimarySucceeded: false,
      directAttempts: [],
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
    researchMetadata: [],
  };

  try {
    const landing = await fetchOfficialLanding();
    const initial = landing.doc;
    evidence.su.directAttempts = landing.attempts;
    evidence.su.exactPrimarySucceeded = landing.exactPrimarySucceeded;
    if (!isOfficialSuUrl(initial.url)) {
      throw new Error(`Official page redirected outside allowed SU domains: ${initial.url}`);
    }
    evidence.su.directSucceeded = true;
    let direct = initial;
    let navigationVia = null;

    if (!documentMatchesDate(initial, targetDate)) {
      evidence.su.dateNavigationTried = true;
      const navigated = await tryOfficialDateNavigation(initial, targetDate);
      if (navigated) {
        direct = navigated.doc;
        navigationVia = navigated.via;
      }
    }

    const dateMatch = documentMatchesDate(direct, targetDate);
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
    evidence.su.directAttempts = error?.attempts ?? evidence.su.directAttempts;
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

  if (evidence.passage) {
    const research = await researchPassage(evidence.passage);
    evidence.researchDocuments = research.documents;
    evidence.researchMetadata = research.metadata;
  }
  return evidence;
}
