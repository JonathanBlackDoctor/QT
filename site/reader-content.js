import { renderProjectPerspectives } from './project-perspectives.js';
import { christologyQualifier, commentaryRails } from './model.js';
import { actionButton, appendParagraphs, el, sectionHeading, textEl } from './dom.js';
import { icon } from './icons.js';

export function renderHero(doc) {
  const hero = el('section', 'reader-hero');
  hero.id = 'top';
  const chips = el('div', 'hero-chips');
  const passage = el('span', 'passage-chip');
  passage.append(icon('book'), document.createTextNode(doc.passage || '본문 확인 실패'));

  const verification = actionButton('verification-chip', 'verification-dialog');
  verification.append(icon('check'), document.createTextNode(`성서유니온 ${doc.verification?.overall || '확인 실패'}`));
  verification.setAttribute('aria-label', '자체 검증 상태 열기');
  chips.append(passage, verification);
  hero.append(
    textEl('p', 'hero-date', doc.displayDate || doc.date || '날짜 확인 실패'),
    textEl('h1', '', doc.status === 'failed' ? '생성 실패 기록' : (doc.title || '오늘의 말씀')),
    chips,
  );
  return hero;
}

export function createDateAnchor() {
  const anchor = el('div', 'date-anchor');
  anchor.id = 'content-start';
  anchor.setAttribute('aria-hidden', 'true');
  return anchor;
}

export function renderReaderSections(sections = {}) {
  return [
    renderReadingGuide(),
    renderContextSection(sections.context),
    renderLeadSection(sections.summary),
    renderQuestions(sections.questions),
    renderLifeApplication(sections.lifeApplication),
    renderPrayer(sections.prayerPoints),
    renderDeepDive(sections),
  ];
}

export function renderEvidenceActions(doc) {
  const section = el('section', 'evidence-actions');
  section.id = 'evidence';
  section.setAttribute('aria-label', '근거와 검증');

  const sources = actionButton('evidence-action', 'sources-dialog');
  sources.append(
    icon('link'), textEl('span', 'action-label', '실제 사용 출처'),
    textEl('span', 'action-value', `${doc.sources?.length ?? 0}건`), icon('chevronRight'),
  );
  const verification = actionButton('evidence-action', 'verification-dialog');
  verification.append(
    icon('check'), textEl('span', 'action-label', '자체 검증 상태'),
    textEl('span', 'action-value verified', doc.verification?.overall || '확인 실패'), icon('chevronRight'),
  );
  section.append(sources, verification);
  return section;
}

function renderReadingGuide() {
  const section = el('aside', 'reading-guide');
  section.setAttribute('aria-label', 'QT 사용 안내');
  section.append(
    textEl('strong', '', '먼저 말씀을 천천히 읽고 묵상해 보세요.'),
    textEl('p', '', '이 해설은 묵상을 대신하기보다, 이해가 더 필요할 때 참고하기 위해 만들었습니다.'),
  );
  return section;
}

function renderContextSection(text) {
  const section = el('section', 'reader-section context-section');
  section.id = 'context';
  section.appendChild(sectionHeading('문맥과 배경', 'context'));

  const { preview, remainder } = splitContext(text);
  section.appendChild(textEl('p', 'context-preview', preview || '표시할 문맥과 배경이 없습니다.'));

  if (remainder) {
    const details = el('details', 'context-details');
    const summary = document.createElement('summary');
    summary.append(
      textEl('span', 'context-more-label', '자세히 보기'),
      el('span', 'details-toggle'),
    );
    const body = el('div', 'context-details-body prose compact-prose');
    appendParagraphs(body, remainder);
    details.append(summary, body);
    section.appendChild(details);
  }

  return section;
}

function renderLeadSection(text) {
  const section = el('section', 'reader-section summary-section prose');
  section.id = 'summary';
  section.appendChild(sectionHeading('본문의 흐름', 'book'));
  appendParagraphs(section, text);
  return section;
}

function renderProseSection({ id, label, iconName, qualifier = null, text }) {
  const section = el('section', 'reader-section prose');
  section.id = id;
  section.appendChild(sectionHeading(label, iconName));
  if (qualifier) section.appendChild(textEl('span', 'qualifier', qualifier));
  appendParagraphs(section, text);
  return section;
}

function renderLifeApplication(items = []) {
  const section = el('section', 'reader-section life-section');
  section.id = 'life-application';
  section.appendChild(sectionHeading('삶으로', 'compass'));
  const list = el('div', 'life-list');
  for (const item of items) {
    const row = el('div', 'life-row');
    row.append(
      textEl('strong', 'life-area', normalizeArea(item?.area)),
      textEl('p', '', item?.text || ''),
    );
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

function renderQuestions(items = []) {
  const section = el('section', 'reader-section question-section');
  section.id = 'questions';
  section.appendChild(sectionHeading('묵상을 위한 질문', 'question'));
  const list = el('ol', 'question-list');
  for (const item of items) list.appendChild(textEl('li', '', item));
  section.appendChild(list);
  return section;
}

function renderPrayer(items = []) {
  const section = el('section', 'reader-section prayer-section prose');
  section.id = 'prayer';
  section.appendChild(sectionHeading('기도 제목', 'prayer'));
  for (const item of items) section.appendChild(textEl('p', '', item));
  return section;
}

function renderDeepDive(sections) {
  const section = el('section', 'deep-section');
  section.id = 'deep-dive';
  const heading = el('div', 'deep-heading');
  heading.append(textEl('h2', '', '더 깊이 읽기'), textEl('span', '', '5개 · 선택'));
  section.appendChild(heading);

  const stack = el('div', 'deep-stack');
  stack.appendChild(detailsItem(
    'christological',
    '그리스도 중심적 연결',
    'cross',
    proseBody(sections.christological, christologyQualifier(sections.christological)),
  ));
  stack.appendChild(detailsItem('su-application', '성서유니온 해설과 적용', 'note', proseBody(sections.suApplication)));
  stack.appendChild(renderProjectPerspectives(sections));
  stack.appendChild(detailsItem('commentary', '깊이 있는 주석 및 강해', 'lines', commentaryBody(sections.commentary)));
  stack.appendChild(sections.language
    ? detailsItem('language', '원어·문법 분석', 'language', languageBody(sections.language))
    : unavailableItem('language', '원어·문법 분석', 'language'));
  section.appendChild(stack);
  return section;
}

function detailsItem(id, title, iconName, content) {
  const details = el('details', 'deep-item');
  details.id = id;
  const summary = document.createElement('summary');
  summary.append(icon(iconName), textEl('span', 'deep-title', title), el('span', 'details-toggle'));
  details.append(summary, content);
  return details;
}

function unavailableItem(id, title, iconName) {
  const row = el('div', 'deep-unavailable');
  row.id = id;
  row.setAttribute('aria-disabled', 'true');
  row.append(icon(iconName), textEl('span', 'deep-title', title), textEl('span', 'availability', '자료 없음'));
  return row;
}

function proseBody(text, qualifier = null) {
  const body = el('div', 'details-body prose compact-prose');
  if (qualifier) body.appendChild(textEl('span', 'qualifier deep-qualifier', qualifier));
  appendParagraphs(body, text);
  return body;
}

function commentaryBody(text) {
  const body = el('div', 'details-body commentary-rail');
  const rails = commentaryRails(text);
  if (!rails.length) body.appendChild(textEl('p', 'empty-inline', '표시할 주석이 없습니다.'));
  for (const segment of rails) {
    const row = el('div', 'commentary-row');
    row.append(textEl('span', 'verse-label', segment.label), textEl('p', '', segment.text));
    body.appendChild(row);
  }
  return body;
}

function languageBody(text) {
  const body = el('div', 'details-body prose compact-prose');
  const hebrew = String(text).match(/[\u0590-\u05FF][\u0590-\u05FF\u200f\u200e\u05B0-\u05BD\u05BF-\u05C7]*/u)?.[0];
  const strong = String(text).match(/Strong'?s?\s*(\d+)/i)?.[1];
  if (hebrew || strong) {
    const token = el('div', 'language-token');
    if (hebrew) {
      const word = textEl('span', 'hebrew-word', hebrew);
      word.lang = 'he'; word.dir = 'rtl'; token.appendChild(word);
    }
    if (strong) token.appendChild(textEl('span', 'strong-number', `Strong's ${strong}`));
    body.appendChild(token);
  }
  appendParagraphs(body, text);
  return body;
}

function splitContext(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { preview: '', remainder: '' };

  const paragraphs = raw.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const first = paragraphs[0] || raw;
  const trailing = paragraphs.slice(1).join('\n\n');

  if (first.length <= 220) {
    return { preview: first, remainder: trailing };
  }

  const sentences = first.match(/[^.!?。！？]+[.!?。！？]?/g) || [first];
  let preview = '';
  for (const sentence of sentences) {
    const next = `${preview} ${sentence.trim()}`.trim();
    if (preview && next.length > 200) break;
    preview = next;
    if (preview.length >= 100) break;
  }

  if (!preview || preview.length > 220) {
    const cut = first.slice(0, 180);
    const lastSpace = cut.lastIndexOf(' ');
    preview = first.slice(0, lastSpace > 120 ? lastSpace : 180).trim();
  }

  const firstRemainder = first.slice(preview.length).trim();
  const remainder = [firstRemainder, trailing].filter(Boolean).join('\n\n');
  return {
    preview: remainder && !/[.!?。！？]$/.test(preview) ? `${preview}…` : preview,
    remainder,
  };
}

function normalizeArea(value) {
  return String(value ?? '').replace(/\s*\([^)]*\)/g, '').replace('·세상', '').trim();
}
