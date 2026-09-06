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
    renderLeadSection(sections.summary),
    renderProseSection({
      id: 'christological', label: '그리스도 중심적 연결', iconName: 'cross',
      qualifier: christologyQualifier(sections.christological), text: sections.christological,
    }),
    renderProseSection({
      id: 'su-application', label: '성서유니온 해설과 적용', iconName: 'note', text: sections.suApplication,
    }),
    renderLifeApplication(sections.lifeApplication),
    renderQuestions(sections.questions),
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

function renderLeadSection(text) {
  const section = el('section', 'reader-section lead-section prose');
  section.id = 'summary';
  section.appendChild(textEl('h2', 'sr-only', '본문 요약'));
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
  heading.append(textEl('h2', '', '더 깊이 읽기'), textEl('span', '', '4개 · 선택'));
  section.appendChild(heading);

  const stack = el('div', 'deep-stack');
  stack.appendChild(detailsItem('context', '문맥과 배경', 'context', proseBody(sections.context)));
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

function proseBody(text) {
  const body = el('div', 'details-body prose compact-prose');
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

function normalizeArea(value) {
  return String(value ?? '').replace(/\s*\([^)]*\)/g, '').replace('·세상', '').trim();
}
