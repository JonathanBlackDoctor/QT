const KST = 'Asia/Seoul';
const DAY_MS = 24 * 60 * 60 * 1000;
// KST is UTC+09:00. The reader's day starts at 04:00, not midnight.
const READING_DAY_OFFSET_MS = 5 * 60 * 60 * 1000;

export function readingDate(now = new Date()) {
  return new Date(new Date(now).getTime() + READING_DAY_OFFSET_MS).toISOString().slice(0, 10);
}

export function millisecondsUntilReadingDay(now = new Date()) {
  const shifted = new Date(now).getTime() + READING_DAY_OFFSET_MS;
  if (!Number.isFinite(shifted)) throw new RangeError('Invalid reading-day timestamp');
  return DAY_MS - ((shifted % DAY_MS + DAY_MS) % DAY_MS);
}

export function selectEntry(index, requestedDate, now = new Date()) {
  const entries = Array.isArray(index) ? index : [];
  const requestedIndex = requestedDate
    ? entries.findIndex((entry) => entry?.date === requestedDate)
    : -1;
  const target = readingDate(now);
  // Select the nearest date at or before the reading day, never a future day.
  // Do not assume the index is sorted; retain its original indices for navigation.
  let entryIndex = requestedIndex;
  if (entryIndex < 0) {
    for (let i = 0; i < entries.length; i++) {
      const date = entries[i]?.date;
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= target
          && (entryIndex < 0 || date > entries[entryIndex].date)) entryIndex = i;
    }
  }
  return {
    entry: entries[entryIndex] ?? null,
    entryIndex,
    selectedDate: entries[entryIndex]?.date ?? null,
    requestedMissing: Boolean(requestedDate && requestedIndex < 0),
  };
}

export function entryNavigation(index, entryIndex) {
  const entries = Array.isArray(index) ? index : [];
  return {
    older: entryIndex >= 0 ? entries[entryIndex + 1] ?? null : null,
    newer: entryIndex >= 0 ? entries[entryIndex - 1] ?? null : null,
  };
}

export function splitParagraphs(value) {
  return String(value ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function commentaryRails(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];

  const sentences = text.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) ?? [text];
  const segments = [];
  let current = null;

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    const match = sentence.match(/(?:^|\s)((?:\d{1,3}(?:\s*[-–~]\s*\d{1,3})?)(?:\s*,\s*\d{1,3}(?:\s*[-–~]\s*\d{1,3})?)*)절/);
    const label = match ? normalizeVerseLabel(match[1]) : current?.label ?? '개요';

    if (!current || current.label !== label) {
      current = { label, text: sentence };
      segments.push(current);
    } else {
      current.text += ` ${sentence}`;
    }
  }

  return segments;
}

export function normalizeVerseLabel(value) {
  const normalized = String(value ?? '')
    .replace(/\s*[-~]\s*/g, '–')
    .replace(/\s*,\s*/g, ', ')
    .trim();
  return normalized ? `${normalized}절` : '개요';
}

export function formatCompactDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return String(date ?? '');
  const [, month, day] = date.split('-');
  const parsed = new Date(`${date}T12:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    weekday: 'short',
  }).format(parsed);
  return `${Number(month)}.${day} (${weekday})`;
}

export function formatTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function verificationRows(verification = {}) {
  return [
    ['전체', verification.overall],
    ['날짜', verification.date],
    ['본문', verification.passage],
    ['제목', verification.title],
    ['성서유니온 해설', verification.suCommentary],
  ].map(([label, value]) => [label, value || '확인 실패']);
}

export function evidenceMetaRows(meta = {}) {
  const directResult = meta.suDirectAttempted
    ? (meta.suDirectSucceeded ? '성공' : '실패')
    : '시도 안 함';
  const dateResult = meta.suDirectDateMatch === true
    ? '일치'
    : meta.suDirectDateMatch === false
      ? '불일치'
      : '확인 안 됨';

  return [
    ['성서유니온 직접 접속', directResult],
    ['직접 확인 날짜', dateResult],
    ['검색 fallback', meta.searchFallbackUsed ? '사용' : '사용 안 함'],
    ['직접 수집 문서', Number.isFinite(meta.researchDirectCount) ? `${meta.researchDirectCount}건` : '기록 없음'],
  ];
}

export function christologyQualifier(text) {
  const value = String(text ?? '');
  if (/직접(?:적인)?\s*(?:예표|예언|성취)|명시적/.test(value) && /않|못|아니/.test(value)) {
    return '신학적 묵상 · 직접 예언 아님';
  }
  return '정경적·신학적 연결';
}
