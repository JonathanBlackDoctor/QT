import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KST = 'Asia/Seoul';
export const SU_TODAY_URL = 'https://sum.su.or.kr:8888/bible/today';

export const WHITELIST_HOSTS = new Set([
  'sum.su.or.kr',
  'su.or.kr',
  'www.su.or.kr',
  'duranno.com',
  'www.duranno.com',
  'bibleproject.com',
  'www.bibleproject.com',
  'youtube.com',
  'www.youtube.com',
  'bskorea.or.kr',
  'www.bskorea.or.kr',
  'biblehub.com',
  'www.biblehub.com',
  'blueletterbible.org',
  'www.blueletterbible.org',
  'netbible.org',
  'www.netbible.org',
  'thegospelcoalition.org',
  'www.thegospelcoalition.org',
  'desiringgod.org',
  'www.desiringgod.org',
  'enduringword.com',
  'www.enduringword.com',
]);

const BOOKS = [
  '창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기',
  '사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더',
  '욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','애가','에스겔','다니엘',
  '호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기',
  '마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서',
  '에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서',
  '빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록',
  '창','출','레','민','신','수','삿','룻','삼상','삼하','왕상','왕하','대상','대하','스','느','에','욥','시','잠','전','아',
  '사','렘','애','겔','단','호','욜','암','옵','욘','미','나','합','습','학','슥','말','마','막','눅','요','행','롬',
  '고전','고후','갈','엡','빌','골','살전','살후','딤전','딤후','딛','몬','히','약','벧전','벧후','요일','요이','요삼','유','계'
];

const BOOK_ALT = BOOKS.sort((a,b)=>b.length-a.length).map(escapeRegex).join('|');
const PASSAGE_RE = new RegExp(
  `(${BOOK_ALT})\\s*(?:\\([^)]{1,80}\\))?\\s*(\\d{1,3})\\s*[:：]\\s*(\\d{1,3})(?:\\s*[-~–—]\\s*(?:(\\d{1,3})\\s*[:：]\\s*)?(\\d{1,3}))?`,
  'g',
);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { force: false, date: null };
  for (const arg of argv) {
    if (arg === '--force') out.force = true;
    else if (arg.startsWith('--date=')) out.date = arg.slice('--date='.length);
  }
  return out;
}

export function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.valueOf())) throw new Error(`Invalid date: ${date}`);
  return date;
}

export function currentKstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

export function koreanDate(date) {
  const d = new Date(`${date}T12:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  }).format(d).replace(/\. /g, '년 ').replace(/\.$/, '');
}

export function datePieces(date) {
  const [y,m,d] = date.split('-');
  return { y, m, d, mi: String(Number(m)), di: String(Number(d)) };
}

export function pageMentionsDate(text, date) {
  const { y,m,d,mi,di } = datePieces(date);
  const patterns = [
    `${y}-${m}-${d}`,
    `${y}.${m}.${d}`,
    `${y}년 ${mi}월 ${di}일`,
    `${mi}월 ${di}일`,
    `${m}/${d}`,
  ];
  const compact = text.replace(/\s+/g, ' ');
  return patterns.some(p => compact.includes(p));
}

export function extractPassages(text) {
  const out = [];
  PASSAGE_RE.lastIndex = 0;
  let m;
  while ((m = PASSAGE_RE.exec(text)) !== null) {
    const [, book, startChapter, startVerse, endChapter, endVerse] = m;
    let ref = `${book} ${startChapter}:${startVerse}`;
    if (endVerse) {
      ref += endChapter && endChapter !== startChapter
        ? `-${endChapter}:${endVerse}`
        : `-${endVerse}`;
    }
    if (!out.includes(ref)) out.push(ref);
  }
  PASSAGE_RE.lastIndex = 0;
  return out;
}

export function decodeHtmlEntities(input) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return input
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, code) => {
      if (code[0] === '#') {
        const hex = code[1]?.toLowerCase() === 'x';
        const n = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : _;
      }
      return named[code.toLowerCase()] ?? _;
    });
}

export function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isWhitelistedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && WHITELIST_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function canonicalHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export async function fetchText(url, { timeoutMs = 20000, maxChars = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'QT-Archive/1.0 (+GitHub Actions; devotional research)',
        'accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
      },
    });
    const finalUrl = res.url || url;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!/text|html|json|xml/i.test(contentType)) throw new Error(`Unsupported content-type: ${contentType}`);
    const raw = await res.text();
    const isHtml = /html/i.test(contentType) || /<html/i.test(raw.slice(0, 500));
    const text = isHtml ? htmlToText(raw) : raw;
    const titleMatch = isHtml ? raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
    const title = titleMatch ? htmlToText(titleMatch[1]).slice(0, 300) : null;
    const links = [];
    if (isHtml) {
      const seen = new Set();
      const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = re.exec(raw)) && links.length < 200) {
        try {
          const href = new URL(decodeHtmlEntities(m[1]), finalUrl).toString();
          if (!/^https?:/i.test(href) || seen.has(href)) continue;
          seen.add(href);
          links.push({ href, text: htmlToText(m[2]).slice(0, 200) });
        } catch {}
      }
    }
    return { ok: true, url: finalUrl, status: res.status, contentType, title, links, text: text.slice(0, maxChars) };
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export function contentPaths(date) {
  const [y,m] = date.split('-');
  const dir = path.join(ROOT, 'content', y, m);
  return {
    dir,
    json: path.join(dir, `${date}.json`),
    md: path.join(dir, `${date}.md`),
    index: path.join(ROOT, 'content', 'index.json'),
  };
}

export function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
