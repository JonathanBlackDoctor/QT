import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceOnlyRecord, hasVerifiedSource, sourceOnlyMarkdown } from './source-only.mjs';
import { contentReadiness } from './qt-readiness.mjs';

const date = '2026-11-07';
const passage = '고린도후서 5:1-10';
const officialUrl = 'https://sum.su.or.kr:8888/bible/today';
const evidence = {
  targetDate: date,
  passage,
  retrievedAt: '2026-11-07T00:00:00Z',
  su: {
    directAttempted: true,
    directSucceeded: true,
    dateStatus: '직접 확인',
    passageStatus: '직접 확인',
    commentaryStatus: '확인 실패',
    directDocument: {
      source: '성서유니온 매일성경',
      url: officialUrl,
      evidenceLevel: 'direct',
      dateMatch: true,
      passageCandidates: [passage],
    },
  },
  researchDocuments: [
    { source: 'BibleHub', url: 'https://biblehub.com/2_corinthians/5.htm', evidenceLevel: 'direct' },
    { source: 'Unverified', url: 'https://example.org/a', evidenceLevel: 'direct' },
  ],
};

test('verified official daily passage yields a clearly labeled source-only record', () => {
  assert.equal(hasVerifiedSource(evidence), true);
  const doc = createSourceOnlyRecord(date, evidence);
  assert.equal(doc.status, 'limited');
  assert.equal(doc.generationMode, 'verified_source_only');
  assert.equal(doc.passage, passage);
  assert.equal(doc.verification.overall, '직접 확인');
  assert.match(doc.notice, /AI 해설/);
  assert.match(doc.sections.summary, /공식 자료/);
  assert.equal(doc.sections.questions.length, 3);
  assert.equal(doc.sections.lifeApplication.length, 4);
  assert.equal(doc.sections.commentary, '');
  assert.equal(doc.sections.christological, '');
  assert.equal(doc.sections.language, null);
  assert.equal(doc.sources.length, 2);
  assert.equal(doc.sources[0].url, officialUrl);
  assert.equal(doc.sources[1].url, 'https://biblehub.com/2_corinthians/5.htm');
  const md = sourceOnlyMarkdown(doc);
  assert.match(md, /본문 확인 · 임시 묵상 가이드/);
  assert.match(md, /AI 해설·주석·그리스도 중심 연결은 생성되지 않았습니다/);
  assert.doesNotMatch(md, /깊이 있는 주석 및 강해/);
  const index = [{ date, status: 'limited', path: '2026/11/2026-11-07.json' }];
  assert.equal(contentReadiness(doc, index, date).ready, true);
});

test('the source-only generator rejects unverified, mismatched or off-domain evidence', () => {
  const check = source => {
    assert.equal(hasVerifiedSource(source), false);
    assert.throws(() => createSourceOnlyRecord(date, source), /directly verified/);
  };
  check({ ...evidence, passage: null });
  check({ ...evidence, su: { ...evidence.su, passageStatus: '검색으로만 확인' } });
  check({ ...evidence, su: { ...evidence.su, directDocument: { ...evidence.su.directDocument, dateMatch: false } } });
  check({ ...evidence, su: { ...evidence.su, directDocument: { ...evidence.su.directDocument, passageCandidates: ['요한복음 1:1'] } } });
  check({ ...evidence, su: { ...evidence.su, directDocument: { ...evidence.su.directDocument, url: 'https://untrusted.example/today' } } });
  assert.throws(() => createSourceOnlyRecord('2026-11-06', evidence), /directly verified/);
});

test('only a fully labeled source-only record is considered publishable', () => {
  const doc = createSourceOnlyRecord(date, evidence);
  const index = [{ date, status: 'limited', path: '2026/11/2026-11-07.json' }];
  assert.equal(contentReadiness({ ...doc, generationMode: 'model_generated' }, index, date).ready, false);
  assert.equal(contentReadiness({ ...doc, verification: { ...doc.verification, passage: '확인 실패' } }, index, date).ready, false);
  assert.equal(contentReadiness({ ...doc, notice: null }, index, date).ready, false);
  assert.equal(contentReadiness(doc, [{ ...index[0], status: 'ok' }], date).ready, false);
});
