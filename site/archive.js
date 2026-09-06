import { el, textEl } from './dom.js';

export function renderArchive(app, index) {
  app.replaceChildren();
  const head = el('header', 'archive-head');
  head.append(
    textEl('p', 'archive-eyebrow', 'ARCHIVE'),
    textEl('h1', '', 'QT 아카이브'),
    textEl('p', 'archive-description', '날짜별 생성 기록과 검증 상태를 보관합니다.'),
  );
  app.appendChild(head);

  if (!Array.isArray(index) || !index.length) {
    app.appendChild(textEl('div', 'empty', '아직 생성된 기록이 없습니다.'));
    return;
  }

  const groups = new Map();
  for (const entry of index) {
    const month = entry.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(entry);
  }

  for (const [month, items] of groups) {
    const section = el('section', 'archive-group');
    const [year, number] = month.split('-');
    section.appendChild(textEl('h2', '', `${year}년 ${Number(number)}월`));
    const list = el('div', 'archive-list');

    for (const item of items) {
      const link = document.createElement('a');
      link.className = 'archive-item';
      link.href = `./?date=${encodeURIComponent(item.date)}`;
      link.appendChild(textEl('span', 'archive-date', item.date.slice(5).replace('-', '.')));
      const copy = el('span', 'archive-copy');
      copy.append(
        textEl('strong', '', item.passage || '본문 확인 실패'),
        textEl('span', '', item.title || (item.status === 'failed' ? '생성 실패 기록' : '오늘의 말씀')),
      );
      link.append(copy, textEl('span', `archive-badge ${item.status === 'failed' ? 'failed' : ''}`, item.verification || '확인 실패'));
      list.appendChild(link);
    }
    section.appendChild(list);
    app.appendChild(section);
  }
}
