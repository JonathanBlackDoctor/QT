import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';

function pageHtml(title, page) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#f7f4ec" />
  <title>${title}</title>
  <meta name="description" content="매일 검증된 자료를 바탕으로 생성하는 성경 큐티 해설 아카이브" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body data-page="${page}">
  <header class="site-header">
    <a class="brand" href="./">QT</a>
    <nav>
      <a href="./">오늘</a>
      <a href="./archive.html">아카이브</a>
    </nav>
  </header>
  <main id="app" class="shell" aria-live="polite">
    <div class="loading">불러오는 중…</div>
  </main>
  <footer class="site-footer">검증 상태와 실제 사용 출처를 각 날짜 기록에 함께 보관합니다.</footer>
  <script type="module" src="./app.js"></script>
</body>
</html>`;
}

const styles = String.raw`
:root {
  --bg: #f7f4ec;
  --surface: #fffdf8;
  --surface-2: #f1eee5;
  --text: #20221e;
  --muted: #6f746c;
  --line: #ddd9ce;
  --accent: #315f49;
  --accent-soft: #e4eee7;
  --danger: #9a4a43;
  --shadow: 0 10px 35px rgba(36, 38, 33, .06);
  --radius: 18px;
  font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--text); }
body { margin: 0; min-height: 100vh; background: var(--bg); }
a { color: inherit; }
.site-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 15px max(20px, env(safe-area-inset-left)); border-bottom: 1px solid color-mix(in srgb, var(--line) 78%, transparent); backdrop-filter: blur(14px); background: color-mix(in srgb, var(--bg) 88%, transparent); }
.brand { text-decoration: none; font-family: Georgia, "Times New Roman", serif; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
nav { display: flex; gap: 14px; }
nav a { color: var(--muted); font-size: 14px; text-decoration: none; }
nav a:hover { color: var(--accent); }
.shell { width: min(840px, calc(100% - 32px)); margin: 34px auto 80px; }
.loading, .empty { padding: 60px 0; text-align: center; color: var(--muted); }
.hero { margin-bottom: 24px; }
.eyebrow { color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 8px 0 8px; font-family: Georgia, "Noto Serif KR", serif; font-size: clamp(31px, 7vw, 52px); line-height: 1.08; letter-spacing: -.035em; }
.passage { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.7; }
.status-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
.badge { display: inline-flex; align-items: center; min-height: 28px; padding: 5px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 650; }
.badge.fail { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.date-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin: 18px 0 26px; }
.date-nav a, .date-nav button { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); padding: 10px 12px; text-decoration: none; font: inherit; font-size: 13px; cursor: pointer; }
.date-nav .next { text-align: right; }
.date-nav .disabled { opacity: .35; pointer-events: none; }
.date-picker { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); padding: 9px 10px; }
.card { margin: 16px 0; padding: clamp(18px, 4vw, 28px); border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.card h2 { margin: 0 0 14px; font-family: Georgia, "Noto Serif KR", serif; font-size: 20px; line-height: 1.35; }
.card p { margin: 0 0 12px; font-size: 15px; line-height: 1.85; word-break: keep-all; }
.card p:last-child { margin-bottom: 0; }
ul.clean, ol.clean { margin: 0; padding-left: 20px; }
ul.clean li, ol.clean li { margin: 8px 0; line-height: 1.75; }
.application-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.application { padding: 13px 14px; border-radius: 13px; background: var(--surface-2); }
.application strong { display: block; margin-bottom: 5px; color: var(--accent); font-size: 12px; }
.application span { font-size: 14px; line-height: 1.65; }
.sources { list-style: none; padding: 0; margin: 0; }
.sources li { padding: 10px 0; border-bottom: 1px solid var(--line); }
.sources li:last-child { border-bottom: 0; }
.sources a { color: var(--accent); font-weight: 650; overflow-wrap: anywhere; }
.source-meta { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.failure { padding: 24px; border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--line)); border-radius: var(--radius); background: var(--surface); color: var(--danger); line-height: 1.8; white-space: pre-line; }
.verification-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.verification-table th, .verification-table td { padding: 9px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.verification-table th { width: 38%; color: var(--muted); font-weight: 500; }
.archive-head { margin-bottom: 22px; }
.archive-group { margin: 28px 0; }
.archive-group h2 { margin: 0 0 10px; font-family: Georgia, "Noto Serif KR", serif; font-size: 20px; }
.archive-list { display: grid; gap: 8px; }
.archive-item { display: grid; grid-template-columns: 110px 1fr auto; gap: 14px; align-items: center; padding: 13px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); text-decoration: none; }
.archive-item:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.archive-date { color: var(--muted); font-size: 13px; }
.archive-passage { font-weight: 650; }
.archive-title { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; font-weight: 400; }
.site-footer { width: min(840px, calc(100% - 32px)); margin: 0 auto 36px; color: var(--muted); font-size: 11px; text-align: center; line-height: 1.6; }
@media (max-width: 620px) {
  .shell { width: min(100% - 24px, 840px); margin-top: 24px; }
  .date-nav { grid-template-columns: 1fr 1fr; }
  .date-picker { grid-column: 1 / -1; grid-row: 1; width: 100%; }
  .application-grid { grid-template-columns: 1fr; }
  .archive-item { grid-template-columns: 86px 1fr; }
  .archive-item .badge { display: none; }
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171916; --surface: #20231f; --surface-2: #282c27; --text: #eef0eb;
    --muted: #a8aea5; --line: #393e37; --accent: #8bc1a2; --accent-soft: #243b2f;
    --danger: #e49a92; --shadow: none;
  }
}
`;

const appJs = String.raw`
const app = document.querySelector('#app');
const page = document.body.dataset.page;

main().catch(err => {
  console.error(err);
  app.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'failure';
  div.textContent = '페이지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.\n' + err.message;
  app.appendChild(div);
});

async function main() {
  const index = await fetchJson('./content/index.json');
  if (page === 'archive') return renderArchive(index);
  return renderHome(index);
}

async function renderHome(index) {
  if (!index.length) {
    app.innerHTML = '<div class="empty">아직 생성된 QT가 없습니다.<br>첫 자동 생성 후 이곳에 기록이 나타납니다.</div>';
    return;
  }
  const params = new URLSearchParams(location.search);
  const requested = params.get('date');
  const selected = requested && index.some(x => x.date === requested) ? requested : index[0].date;
  const entryIndex = index.findIndex(x => x.date === selected);
  const entry = index[entryIndex];
  const doc = await fetchJson('./content/' + entry.path);

  app.replaceChildren();
  const hero = el('section', 'hero');
  hero.append(
    textEl('div', 'eyebrow', doc.displayDate || doc.date),
    textEl('h1', '', doc.status === 'ok' ? (doc.title || '오늘의 말씀') : '생성 실패 기록'),
    textEl('p', 'passage', doc.passage ? '📖 ' + doc.passage : '본문을 확인하지 못했습니다.'),
  );
  const status = el('div', 'status-row');
  status.appendChild(textEl('span', 'badge' + (doc.status === 'failed' ? ' fail' : ''), '성서유니온 ' + doc.verification.overall));
  if (doc.status === 'ok') status.appendChild(textEl('span', 'badge', 'Evidence-first 생성'));
  hero.appendChild(status);
  app.appendChild(hero);

  app.appendChild(dateNav(index, entryIndex, selected));

  if (doc.status === 'failed') {
    app.appendChild(textEl('div', 'failure', doc.failureMessage));
    app.appendChild(verificationCard(doc.verification));
    return;
  }

  const s = doc.sections;
  addTextCard('📖 본문 요약', s.summary);
  addTextCard('🗺️ 문맥과 배경', s.context);
  if (s.projectPerspective) addTextCard('🎥 바이블프로젝트 & 리딩지저스 관점', s.projectPerspective);
  addTextCard('📚 깊이 있는 주석 및 강해', s.commentary);
  if (s.language) addTextCard('✍️ 원어·문법 분석', s.language);
  addTextCard('✝️ 그리스도 중심적 연결', s.christological);
  addTextCard('📝 성서유니온 해설 및 적용', s.suApplication);

  const lifeCard = card('💡 보편적 삶의 적용');
  const grid = el('div', 'application-grid');
  for (const a of s.lifeApplication || []) {
    const box = el('div', 'application');
    box.append(textEl('strong', '', a.area), textEl('span', '', a.text));
    grid.appendChild(box);
  }
  lifeCard.appendChild(grid);
  app.appendChild(lifeCard);

  app.appendChild(listCard('🙏 묵상을 위한 질문 3가지', s.questions, true));
  app.appendChild(listCard('🙏 기도 제목 제안', s.prayerPoints, false));
  app.appendChild(sourceCard(doc.sources || []));
  app.appendChild(verificationCard(doc.verification));

  function addTextCard(title, text) {
    const c = card(title);
    for (const para of splitParas(text)) c.appendChild(textEl('p', '', para));
    app.appendChild(c);
  }
}

function dateNav(index, i, selected) {
  const wrap = el('div', 'date-nav');
  const older = index[i + 1];
  const newer = index[i - 1];
  wrap.appendChild(navLink('← 이전 날', older, 'prev'));
  const input = document.createElement('input');
  input.type = 'date'; input.className = 'date-picker'; input.value = selected;
  input.min = index[index.length - 1].date; input.max = index[0].date;
  input.addEventListener('change', () => {
    if (index.some(x => x.date === input.value)) location.href = './?date=' + input.value;
    else { alert('해당 날짜에는 생성된 QT가 없습니다.'); input.value = selected; }
  });
  wrap.appendChild(input);
  wrap.appendChild(navLink('다음 날 →', newer, 'next'));
  return wrap;
}

function navLink(label, entry, cls) {
  const a = document.createElement('a');
  a.className = cls + (entry ? '' : ' disabled');
  a.textContent = label;
  a.href = entry ? './?date=' + entry.date : '#';
  return a;
}

function renderArchive(index) {
  app.replaceChildren();
  const head = el('div', 'archive-head');
  head.append(textEl('div', 'eyebrow', 'ARCHIVE'), textEl('h1', '', 'QT 아카이브'), textEl('p', 'passage', '날짜별 생성 기록과 검증 상태를 보관합니다.'));
  app.appendChild(head);
  if (!index.length) { app.appendChild(textEl('div', 'empty', '아직 생성된 기록이 없습니다.')); return; }

  const groups = new Map();
  for (const x of index) {
    const key = x.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(x);
  }
  for (const [month, items] of groups) {
    const section = el('section', 'archive-group');
    const [y,m] = month.split('-');
    section.appendChild(textEl('h2', '', y + '년 ' + Number(m) + '월'));
    const list = el('div', 'archive-list');
    for (const x of items) {
      const a = document.createElement('a');
      a.className = 'archive-item'; a.href = './?date=' + x.date;
      a.appendChild(textEl('span', 'archive-date', x.date.slice(5).replace('-', '.')));
      const body = el('span', 'archive-passage');
      body.appendChild(document.createTextNode(x.passage || '본문 확인 실패'));
      if (x.title) body.appendChild(textEl('span', 'archive-title', x.title));
      a.appendChild(body);
      a.appendChild(textEl('span', 'badge' + (x.status === 'failed' ? ' fail' : ''), x.verification));
      list.appendChild(a);
    }
    section.appendChild(list); app.appendChild(section);
  }
}

function card(title) {
  const c = el('section', 'card');
  c.appendChild(textEl('h2', '', title));
  return c;
}

function listCard(title, items, ordered) {
  const c = card(title);
  const list = document.createElement(ordered ? 'ol' : 'ul');
  list.className = 'clean';
  for (const item of items || []) list.appendChild(textEl('li', '', item));
  c.appendChild(list); return c;
}

function sourceCard(sources) {
  const c = card('🔗 참고 출처');
  if (!sources.length) { c.appendChild(textEl('p', '', '실제 사용한 추가 출처가 없습니다.')); return c; }
  const ul = el('ul', 'sources');
  for (const s of sources) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = s.label;
    li.append(a, textEl('span', 'source-meta', (s.evidenceLevel === 'direct' ? '직접 확인' : '검색 스니펫') + (s.usedFor ? ' · ' + s.usedFor : '')));
    ul.appendChild(li);
  }
  c.appendChild(ul); return c;
}

function verificationCard(v) {
  const c = card('✅ 자체 검증 상태');
  const table = el('table', 'verification-table');
  const rows = [['전체',v.overall],['날짜',v.date],['본문',v.passage],['제목',v.title],['성서유니온 해설',v.suCommentary]];
  for (const [k,val] of rows) {
    const tr = document.createElement('tr'); tr.append(textEl('th','',k), textEl('td','',val || '확인 실패')); table.appendChild(tr);
  }
  c.appendChild(table); return c;
}

function splitParas(text) { return String(text || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); }
function el(tag, cls) { const x = document.createElement(tag); if (cls) x.className = cls; return x; }
function textEl(tag, cls, text) { const x = el(tag, cls); x.textContent = text ?? ''; return x; }
async function fetchJson(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); }
`;

const dist = path.join(ROOT, 'dist');
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(ROOT, 'content'), path.join(dist, 'content'), { recursive: true });

await fs.writeFile(path.join(dist, 'index.html'), pageHtml('오늘의 QT', 'home'), 'utf8');
await fs.writeFile(path.join(dist, 'archive.html'), pageHtml('QT 아카이브', 'archive'), 'utf8');
await fs.writeFile(path.join(dist, 'styles.css'), styles, 'utf8');
await fs.writeFile(path.join(dist, 'app.js'), appJs, 'utf8');
await fs.writeFile(path.join(dist, '404.html'), pageHtml('QT', 'home'), 'utf8');
await fs.writeFile(path.join(dist, '.nojekyll'), '', 'utf8');
console.log('Site built to dist/');
