import {
  entryNavigation,
  evidenceMetaRows,
  formatCompactDate,
  formatTimestamp,
  verificationRows,
} from './model.js';
import { actionButton, el, reducedMotion, textEl } from './dom.js';
import { icon } from './icons.js';

let statusTimer;

export function removeHomeChrome() {
  document.querySelectorAll('.date-dock, .bottom-sheet').forEach((node) => node.remove());
}

export function setReaderHeader(doc) {
  const date = document.querySelector('#header-date');
  const title = document.querySelector('#header-title');
  if (date) date.textContent = doc.displayDate || doc.date || '오늘의 QT';
  if (title) title.textContent = doc.title || '오늘의 말씀';
}

export function announceMissingDate(requestedDate, selectedDate) {
  setPageStatus(`${requestedDate}에는 생성된 QT가 없어 ${selectedDate} 기록을 표시했습니다.`);
}

export function installHomeChrome(doc, index, selection) {
  document.body.appendChild(renderDateDock(index, selection.entryIndex, selection.selectedDate));
  const dialogs = [renderSourcesDialog(doc.sources ?? []), renderVerificationDialog(doc), renderTocDialog()];
  document.body.append(...dialogs);

  document.querySelectorAll('[data-dialog]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const target = document.getElementById(trigger.dataset.dialog);
      if (target) openDialog(target, trigger);
    });
  });
  dialogs.forEach(setupDialog);
  setupReaderChrome();
}

function renderDateDock(index, entryIndex, selectedDate) {
  const nav = entryNavigation(index, entryIndex);
  const dock = el('nav', 'date-dock');
  dock.setAttribute('aria-label', '날짜 이동');
  dock.appendChild(dateNavControl('이전 날', nav.older, 'older'));

  const pickerLabel = el('label', 'date-current');
  pickerLabel.append(icon('calendar'), textEl('span', '', formatCompactDate(selectedDate)));
  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'date-picker-input';
  picker.value = selectedDate;
  picker.min = index[index.length - 1]?.date || selectedDate;
  picker.max = index[0]?.date || selectedDate;
  picker.setAttribute('aria-label', '날짜 선택');
  picker.addEventListener('change', () => {
    const match = index.find((entry) => entry.date === picker.value);
    if (match) return location.assign(`./?date=${encodeURIComponent(match.date)}`);
    setPageStatus(`${picker.value}에는 생성된 QT가 없습니다.`);
    picker.value = selectedDate;
  });
  pickerLabel.appendChild(picker);
  dock.append(pickerLabel, dateNavControl('다음 날', nav.newer, 'newer'));
  return dock;
}

function dateNavControl(label, entry, direction) {
  const node = entry ? document.createElement('a') : document.createElement('button');
  node.className = `date-step ${direction}`;
  if (entry) node.href = `./?date=${encodeURIComponent(entry.date)}`;
  else node.disabled = true;
  const arrow = icon(direction === 'older' ? 'chevronLeft' : 'chevronRight');
  const text = textEl('span', '', label);
  direction === 'older' ? node.append(arrow, text) : node.append(text, arrow);
  return node;
}

function renderSourcesDialog(sources) {
  const body = el('div', 'sheet-list source-list');
  if (!sources.length) body.appendChild(textEl('p', 'empty-inline', '실제 사용한 추가 출처가 없습니다.'));
  sources.forEach((source, index) => {
    const item = el('article', 'source-item');
    const heading = el('div', 'source-heading');
    const link = textEl('a', 'source-link', source.label || source.url);
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    heading.append(
      textEl('span', 'source-number', String(index + 1).padStart(2, '0')),
      link,
      textEl('span', `evidence-level ${source.evidenceLevel === 'direct' ? 'direct' : ''}`, source.evidenceLevel === 'direct' ? '직접 확인' : '검색 스니펫'),
    );
    item.append(heading, textEl('p', 'source-use', source.usedFor || '사용 범위 기록 없음'));
    body.appendChild(item);
  });
  return bottomSheet('sources-dialog', '실제 사용 출처', 'Evidence Bundle에 기록된 URL만 표시합니다.', body);
}

function renderVerificationDialog(doc) {
  const body = el('div', 'sheet-list');
  const overview = el('div', 'verification-list');
  for (const [label, value] of verificationRows(doc.verification)) overview.appendChild(verificationRow(label, value));
  body.appendChild(overview);

  if (doc.evidenceMeta) {
    body.appendChild(textEl('h3', 'sheet-subheading', '수집 상태'));
    const meta = el('div', 'verification-list');
    for (const [label, value] of evidenceMetaRows(doc.evidenceMeta)) meta.appendChild(verificationRow(label, value));
    body.appendChild(meta);
  }

  const timestamps = [
    ['수집', formatTimestamp(doc.evidenceMeta?.retrievedAt)],
    ['생성', formatTimestamp(doc.generatedAt)],
    ['검토', formatTimestamp(doc.reviewedAt)],
  ].filter(([, value]) => value);
  if (timestamps.length) body.appendChild(textEl('p', 'timestamp-note', timestamps.map(([label, value]) => `${label} ${value}`).join(' · ')));
  if (doc.reviewNote) body.appendChild(textEl('p', 'review-note', `검토 메모: ${doc.reviewNote}`));
  return bottomSheet('verification-dialog', '자체 검증 상태', doc.verification?.overall || '확인 상태 기록', body);
}

function verificationRow(label, value) {
  const row = el('div', 'verification-row');
  row.append(textEl('span', '', label), textEl('strong', /직접|성공|일치/.test(value) ? 'verified' : '', value));
  return row;
}

function renderTocDialog() {
  const body = el('nav', 'toc-list');
  body.setAttribute('aria-label', '문서 목차');
  const entries = [
    ['01', '문맥과 배경', 'context'], ['02', '본문의 흐름', 'summary'],
    ['03', '묵상을 위한 질문', 'questions'], ['04', '삶으로', 'life-application'],
    ['05', '기도 제목', 'prayer'], ['06', '더 깊이 읽기', 'deep-dive'],
  ];
  for (const [number, label, id] of entries) {
    const button = el('button', 'toc-item');
    button.type = 'button';
    button.append(textEl('span', 'toc-number', number), textEl('span', '', label));
    button.addEventListener('click', () => {
      closeDialog(button.closest('dialog'), false);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
    });
    body.appendChild(button);
  }
  body.appendChild(el('div', 'toc-divider'));
  const source = actionButton('toc-item', 'sources-dialog');
  source.append(textEl('span', 'toc-number', '07'), textEl('span', '', '실제 사용 출처'));
  const verify = actionButton('toc-item', 'verification-dialog');
  verify.append(textEl('span', 'toc-number', '08'), textEl('span', '', '자체 검증 상태'));
  const archive = textEl('a', 'toc-item', '아카이브 보기');
  archive.href = './archive.html'; archive.prepend(textEl('span', 'toc-number', '→'));
  body.append(source, verify, archive);
  return bottomSheet('toc-dialog', '목차', '핵심 흐름 5개 · 심화 5개 · 근거 2개', body);
}

function bottomSheet(id, title, subtitle, body) {
  const dialog = el('dialog', 'bottom-sheet');
  dialog.id = id; dialog.setAttribute('aria-labelledby', `${id}-title`);
  const panel = el('div', 'sheet-panel');
  panel.appendChild(el('div', 'sheet-handle'));
  const header = el('header', 'sheet-header');
  const copy = el('div', 'sheet-copy');
  const heading = textEl('h2', '', title); heading.id = `${id}-title`;
  copy.append(heading, textEl('p', '', subtitle));
  const close = el('button', 'sheet-close');
  close.type = 'button'; close.setAttribute('aria-label', '닫기'); close.appendChild(icon('close'));
  header.append(copy, close); panel.append(header, body); dialog.appendChild(panel);
  return dialog;
}

function setupDialog(dialog) {
  dialog.querySelector('.sheet-close')?.addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
  dialog.addEventListener('close', () => {
    if (!document.querySelector('.bottom-sheet[open]')) document.body.classList.remove('sheet-open');
    if (dialog.__restoreFocus !== false) dialog.__trigger?.focus?.();
    dialog.__restoreFocus = true; dialog.__trigger = null;
  });
}

function openDialog(dialog, trigger) {
  const parent = trigger.closest?.('dialog');
  if (parent?.open && parent !== dialog) closeDialog(parent, false);
  dialog.__trigger = parent?.__trigger || trigger;
  document.body.classList.add('sheet-open');
  typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', '');
}

function closeDialog(dialog, restoreFocus = true) {
  if (!dialog) return;
  dialog.__restoreFocus = restoreFocus;
  if (typeof dialog.close === 'function') dialog.close();
  else { dialog.removeAttribute('open'); document.body.classList.remove('sheet-open'); }
}

function setupReaderChrome() {
  const header = document.querySelector('#reader-header');
  const progress = document.querySelector('#progress-bar');
  const trigger = document.querySelector('#toc-trigger');
  if (!header || !progress) return;
  trigger?.addEventListener('click', () => {
    const dialog = document.getElementById('toc-dialog');
    if (dialog) openDialog(dialog, trigger);
  });
  let queued = false;
  const update = () => {
    queued = false;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, window.scrollY / max))})`;
    header.classList.toggle('is-scrolled', window.scrollY > 120);
  };
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true; requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function setPageStatus(message) {
  const status = document.querySelector('#page-status');
  if (!status) return;
  clearTimeout(statusTimer);
  status.textContent = message; status.classList.add('visible');
  statusTimer = setTimeout(() => status.classList.remove('visible'), 5000);
}
