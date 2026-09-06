function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function homeHeader() {
  return `
  <header class="reader-header" id="reader-header">
    <a class="reader-brand" href="./" aria-label="오늘의 QT">QT</a>
    <div class="reader-header-copy">
      <span class="header-kicker" id="header-date">오늘의 QT</span>
      <strong class="header-title" id="header-title">오늘의 말씀</strong>
    </div>
    <button class="icon-button toc-trigger" id="toc-trigger" type="button" aria-label="목차 열기" aria-haspopup="dialog">
      <svg viewBox="0 0 20 16" aria-hidden="true"><path d="M1 2h18M1 8h13M1 14h8" /></svg>
    </button>
    <div class="progress-track" aria-hidden="true"><span id="progress-bar"></span></div>
  </header>`;
}

function archiveHeader() {
  return `
  <header class="site-header">
    <a class="site-brand" href="./">QT</a>
    <nav aria-label="주요 메뉴">
      <a href="./">오늘</a>
      <a href="./archive.html" aria-current="page">아카이브</a>
    </nav>
  </header>`;
}

export function pageHtml(title, page) {
  const safeTitle = escapeHtml(title);
  const safePage = page === 'archive' ? 'archive' : 'home';
  const isHome = safePage === 'home';

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#f7f4ec" />
  <title>${safeTitle}</title>
  <meta name="description" content="매일 검증된 자료를 바탕으로 생성하는 성경 큐티 해설 아카이브" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&amp;family=Noto+Serif+KR:wght@400;500;600&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body data-page="${safePage}" class="${isHome ? 'reader-page' : 'archive-page'}">
${isHome ? homeHeader() : archiveHeader()}
  <main id="app" class="${isHome ? 'reader-shell' : 'archive-shell'}">
    <div class="loading">불러오는 중…</div>
  </main>
  <div id="page-status" class="page-status" role="status" aria-live="polite" aria-atomic="true"></div>
  <script type="module" src="./app.js"></script>
</body>
</html>`;
}
