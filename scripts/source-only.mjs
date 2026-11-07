import { assertDate, isWhitelistedUrl, koreanDate } from './lib.mjs';

// A no-inference fallback for a verified SU passage. A model outage should
// not hide the date's verified reading, and must not create fake commentary.
export function hasVerifiedSource(evidence) {
  const su = evidence?.su;
  const doc = su?.directDocument;
  return Boolean(
    evidence?.passage &&
    doc?.dateMatch === true &&
    su?.passageStatus === '직접 확인' &&
    doc.passageCandidates?.includes(evidence.passage) &&
    doc.url && isWhitelistedUrl(doc.url),
  );
}

export function createSourceOnlyRecord(date, evidence) {
  assertDate(date);
  if (!hasVerifiedSource(evidence) || evidence.targetDate !== date) {
    throw new Error('Source-only QT requires a directly verified SU passage for the exact date.');
  }

  const passage = evidence.passage;
  const sources = [];
  const add = (item, usedFor) => {
    if (!item?.url || item.evidenceLevel !== 'direct' || !isWhitelistedUrl(item.url)) return;
    if (sources.some(s => s.url === item.url)) return;
    sources.push({
      label: String(item.source || new URL(item.url).hostname),
      url: item.url,
      usedFor,
      evidenceLevel: 'direct',
    });
  };
  add(evidence.su.directDocument, '해당 날짜와 성경 본문을 공식 자료에서 직접 검증');
  for (const item of evidence.researchDocuments || []) {
    add(item, '본문과 관련된 읽기 자료 링크(자동 해설에 사용하지 않음)');
  }

  return {
    schemaVersion: 1,
    status: 'limited',
    generationMode: 'verified_source_only',
    date,
    displayDate: koreanDate(date),
    passage,
    title: null,
    verification: {
      overall: '직접 확인',
      date: evidence.su.dateStatus,
      passage: evidence.su.passageStatus,
      title: '확인 실패',
      suCommentary: evidence.su.commentaryStatus,
    },
    notice: 'AI 해설 서비스 연결이 중단되어, 공식 본문 확인과 묵상 질문만 제공합니다. 아래 글은 본문 요약이나 실제 주석이 아닙니다.',
    sections: {
      summary: '성서유니온 공식 자료에서 ' + date + '의 본문이 ' + passage +
        '임을 직접 확인했습니다. 본문을 먼저 읽고, 각 문장의 주어·핵심 단어·문맥을 표시해 보세요. 해설을 추측하여 덧붙이지 않았습니다.',
      context: '',
      projectPerspective: null,
      commentary: '',
      language: null,
      christological: '',
      suApplication: '',
      lifeApplication: [
        { area: '개인', text: '오늘 읽은 말씀에서 자신에게 특별히 와 닿은 표현과 그 이유를 적어 보세요.' },
        { area: '관계', text: '말씀을 읽으며 가까운 사람에게 실천할 작은 태도 하나를 선택해 보세요.' },
        { area: '공동체(교회)', text: '공동체 안에서 함께 기도하거나 돌아볼 부분을 생각해 보세요.' },
        { area: '일터·세상', text: '오늘의 공부·일·생활에서 말씀을 기억하며 점검할 행동을 골라 보세요.' },
      ],
      questions: [
        '본문에서 반복되거나 강조되는 표현은 무엇이며, 앞뒤 문맥에서 무슨 역할을 하나요?',
        '본문의 화자와 대상은 누구인가요? 직접 확인한 구절을 바탕으로 적어 보세요.',
        '오늘 이 말씀 앞에서 점검하거나 실천할 한 가지는 무엇인가요?',
      ],
      prayerPoints: [
        '본문을 서둘러 해석하기보다 바르게 읽고 이해하도록 지혜를 구합니다.',
        '오늘 발견한 실천을 작은 행동으로 이어 가도록 기도합니다.',
      ],
    },
    sources,
    evidenceMeta: {
      retrievedAt: evidence.retrievedAt,
      generationMode: 'verified_source_only',
      modelOutput: 'unavailable',
      suDirectAttempted: evidence.su.directAttempted,
      suDirectSucceeded: evidence.su.directSucceeded,
      suDirectUrl: evidence.su.directDocument.url,
      suDirectDateMatch: true,
      researchDirectCount: evidence.researchDocuments?.length || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function sourceOnlyMarkdown(doc) {
  if (doc.status !== 'limited') throw new Error('Expected a limited QT record');
  return [
    '# QT — ' + doc.displayDate,
    '',
    '## 본문 확인 · 임시 묵상 가이드',
    '',
    '📖 오늘 읽을 말씀: ' + doc.passage,
    '',
    doc.notice,
    '',
    doc.sections.summary,
    '',
    '## 묵상 질문',
    ...doc.sections.questions.map((question, i) => (i + 1) + '. ' + question),
    '',
    '## 삶으로',
    ...doc.sections.lifeApplication.map(item => '- **' + item.area + '**: ' + item.text),
    '',
    '## 기도 제목',
    ...doc.sections.prayerPoints.map(x => '- ' + x),
    '',
    '## 직접 확인한 출처',
    ...doc.sources.map(x => '- [' + x.label + '](' + x.url + ') — ' + x.usedFor),
    '',
    '※ AI 해설·주석·그리스도 중심 연결은 생성되지 않았습니다. 본문 자체만 직접 확인한 상태입니다.',
    '',
  ].join('\n');
}
