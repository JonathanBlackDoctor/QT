import { renderArchive } from './archive.js';
import { textEl } from './dom.js';
import { millisecondsUntilReadingDay, readingDate, selectEntry } from './model.js';
import {
  createDateAnchor,
  renderEvidenceActions,
  renderHero,
  renderReaderSections,
} from './reader-content.js';
import {
  announceMissingDate,
  installHomeChrome,
  removeHomeChrome,
  setReaderHeader,
} from './reader-chrome.js';

const app = document.querySelector('#app');
const page = document.body.dataset.page;

main().catch((error) => {
  console.error(error);
  app.replaceChildren(textEl('div', 'failure-panel', `페이지를 불러오지 못했습니다.\n${error.message}`));
});

async function main() {
  const index = await fetchJson('./content/index.json');
  if (page === 'archive') return renderArchive(app, index);
  return renderHome(index);
}

async function renderHome(index) {
  removeHomeChrome();
  const now = new Date();
  const defaultDate = readingDate(now);
  const requestedDate = new URLSearchParams(location.search).get('date');
  const selection = selectEntry(index, requestedDate, now);
  if (!requestedDate) watchReadingDay(defaultDate, now);

  if (!selection.entry) {
    setReaderHeader({ date: defaultDate, title: '해설 준비 중' });
    app.replaceChildren(textEl('div', 'empty', `${defaultDate}까지의 QT가 아직 준비되지 않았습니다.\n첫 화면의 날짜는 한국시간 04:00에 전환됩니다.`));
    const archive = textEl('a', 'record-note', '생성된 날짜를 아카이브에서 선택하기 →');
    archive.href = './archive.html';
    app.append(archive);
    return;
  }

  const doc = await fetchJson(`./content/${selection.entry.path}`);
  document.title = `${doc.title || '오늘의 QT'} · QT`;
  setReaderHeader(doc);
  app.replaceChildren(renderHero(doc), createDateAnchor());
  if ((!requestedDate || selection.requestedMissing) && selection.selectedDate !== defaultDate) {
    app.append(textEl('p', 'record-note', `${defaultDate} 해설이 아직 준비되지 않아 ${selection.selectedDate} 기록을 표시합니다.`));
  }

  if (doc.status === 'failed') {
    app.append(
      textEl('section', 'failure-panel reader-failure', doc.failureMessage || '이 날짜의 QT 생성에 실패했습니다.'),
      renderEvidenceActions(doc),
    );
  } else {
    app.append(
      ...renderReaderSections(doc.sections),
      renderEvidenceActions(doc),
      textEl('p', 'record-note', '첫 화면은 한국시간 매일 04:00에 전환됩니다. 검증 상태와 실제 사용 출처를 각 날짜 기록에 함께 보관합니다.'),
    );
  }

  installHomeChrome(doc, index, selection);
  if (selection.requestedMissing) announceMissingDate(requestedDate, selection.selectedDate);
}

function watchReadingDay(renderedDate, now) {
  // Also cover sleeping/background tabs and the browser's back/forward cache.
  // Explicit ?date= links never install this handler and remain pinned.
  const check = () => {
    if (document.visibilityState !== 'hidden' && readingDate() !== renderedDate) location.reload();
  };
  window.setTimeout(check, millisecondsUntilReadingDay(now) + 50);
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}
