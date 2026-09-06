import { el, textEl, appendParagraphs } from './dom.js';
import { icon } from './icons.js';

export const PROJECT_STATUS_LABELS = {
  ready: '해설 자료 확보', metadata_only: '영상 정보만 확보', not_found: '관련 자료 없음',
  fetch_failed: '접속 실패', identity_unverified: '공식 채널 확인 실패',
  unsupported_book: '책 이름 확인 필요', not_configured: '설정 필요',
};
const names = { bibleproject: '바이블프로젝트', readingjesus: '리딩지저스' };

export function safeProjectLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')
      && ['bibleproject.com','www.bibleproject.com','youtube.com','www.youtube.com'].includes(u.hostname);
  } catch { return false; }
}

export function renderProjectPerspectives(sections = {}) {
  const details = el('details', 'deep-item project-perspectives');
  details.id = 'project-perspective';
  const summary = document.createElement('summary');
  summary.append(icon('film'), textEl('span', 'deep-title', '바이블프로젝트 · 리딩지저스'), el('span', 'details-toggle'));
  const body = el('div', 'details-body project-source-list');
  const states = sections.projectPerspectives;
  if (!states) {
    const legacy = el('div', 'prose compact-prose');
    appendParagraphs(legacy, sections.projectPerspective || '아직 출처별 수집 상태가 기록되지 않았습니다. 자료 보충 실행 후 상태가 표시됩니다.');
    body.appendChild(legacy);
  } else {
    for (const [provider, name] of Object.entries(names)) {
      const state = states[provider];
      const article = el('section', 'project-source prose compact-prose');
      const head = el('div', 'project-source-heading');
      head.append(textEl('h3', '', name));
      const label = state?.summaryStatus === 'ready' ? '관점 준비됨' : PROJECT_STATUS_LABELS[state?.status] || '수집 기록 없음';
      head.append(textEl('span', `project-source-status ${state?.summaryStatus === 'ready' ? 'ready' : ''}`, label));
      article.appendChild(head);
      article.appendChild(textEl('p', 'project-source-scope', state?.scope === 'book' ? `${state.book || ''} · 책 전체의 흐름을 오늘 본문에 연결` : '출처별 확인 상태'));
      if (state?.summaryStatus === 'ready' && state.summary) appendParagraphs(article, state.summary);
      if (state?.reason) article.appendChild(textEl('p', 'project-source-note', state.reason));
      if (state?.summaryError && state.summaryStatus !== 'ready') article.appendChild(textEl('p', 'project-source-note', state.summaryError));
      if (state?.status === 'metadata_only' && state.description) {
        article.appendChild(textEl('p', 'project-source-note', `공개 영상 설명: ${state.description.slice(0,300)}${state.description.length > 300 ? '…' : ''}`));
      }
      if (state?.lastAttempt) article.appendChild(textEl('p', 'project-source-note', `최근 재시도: ${PROJECT_STATUS_LABELS[state.lastAttempt.status] || state.lastAttempt.status}. 이전에 확보한 관점을 보존했습니다.`));
      for (const source of state?.sources || []) {
        if (!safeProjectLink(source.url)) continue;
        const link = textEl('a', 'source-link project-source-link', source.title || '확인한 원문 열기');
        link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        article.appendChild(link);
        article.appendChild(textEl('p', 'project-source-note', source.contentKind === 'video_metadata' ? `확인 범위: ${source.metadataFields?.includes('description') ? '제목·채널·설명' : '제목·채널'}만. 영상 해설을 확인했다는 뜻이 아닙니다.`
          : source.contentKind === 'transcript' ? `확인 범위: 실제 확보한 ${source.automaticCaptions ? '자동 ' : ''}자막${source.language ? ` (${source.language})` : ''}` : '확인 범위: 공식 해설 페이지 본문'));
      }
      if (state?.checkedAt && Number.isFinite(Date.parse(state.checkedAt))) article.appendChild(textEl('p', 'project-source-time', `자료 확인 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.checkedAt))}`));
      body.appendChild(article);
    }
  }
  details.append(summary, body);
  return details;
}
