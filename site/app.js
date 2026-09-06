import { renderArchive } from './archive.js';
import { textEl } from './dom.js';
import { selectEntry } from './model.js';
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
  if (!Array.isArray(index) || !index.length) {
    app.replaceChildren(textEl('div', 'empty', '아직 생성된 QT가 없습니다.\n첫 자동 생성 후 이곳에 기록이 나타납니다.'));
    return;
  }

  const requestedDate = new URLSearchParams(location.search).get('date');
  const selection = selectEntry(index, requestedDate);
  const doc = await fetchJson(`./content/${selection.entry.path}`);
  document.title = `${doc.title || '오늘의 QT'} · QT`;
  setReaderHeader(doc);
  app.replaceChildren(renderHero(doc), createDateAnchor());

  if (doc.status === 'failed') {
    app.append(
      textEl('section', 'failure-panel reader-failure', doc.failureMessage || '이 날짜의 QT 생성에 실패했습니다.'),
      renderEvidenceActions(doc),
    );
  } else {
    app.append(
      ...renderReaderSections(doc.sections),
      renderEvidenceActions(doc),
      textEl('p', 'record-note', '검증 상태와 실제 사용 출처를 각 날짜 기록에 함께 보관합니다.'),
    );
  }

  installHomeChrome(doc, index, selection);
  if (selection.requestedMissing) announceMissingDate(requestedDate, selection.selectedDate);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}
