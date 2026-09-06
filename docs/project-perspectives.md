# 출처별 관점 보충

기존 QT 생성과 별도의 후처리입니다. `scripts/generate.mjs`의 기존 스키마와 `projectPerspective` 문자열은 이전 기록 호환성을 위해 유지합니다. 새 화면은 `sections.projectPerspectives.bibleproject`와 `readingjesus`를 우선 사용합니다. 기존 CSE 연구 경로의 성공 여부와 무관하게 새 수집기를 실행합니다.

## 수집과 근거

- BibleProject: 66권의 책 이름을 공식 사이트의 **후보** 주소에 연결합니다. HTTP 성공만으로 자료 확보라고 하지 않고 페이지 제목/주요 제목과 해설 문단에서 해당 책을 확인합니다. 실패 시 CSE가 설정되어 있으면 영문 책명→한국어 책명으로 검색을 보완합니다. 후보 URL을 검증된 출처로 저장하지 않습니다.
- 리딩지저스: `@readingjesus` 공개 채널 메타데이터에서 채널 ID와 핸들을 확인하고, 해당 책의 후보 영상마다 실제 영상의 채널 ID가 일치하는지 재확인합니다. 공개 플레이어에 자막 트랙이 있고 실제 자막 요청도 성공한 경우에만 영상 해설을 요약합니다. 자동 자막은 그 사실을 표시합니다. 낭독 자료를 강해 관점으로 대체하지 않습니다. 접근 제한/로그인/차단은 우회하지 않습니다.
- 제목·설명만 확보한 경우는 `metadata_only`로 저장하고 모델 요약을 호출하지 않습니다. 검색 스니펫만으로 직접 해설을 작성하지 않습니다.
- 모델은 해당 출처의 확보한 텍스트와 기존 QT의 본문 요약만 받습니다. 짧은 실제 근거 문구, 새 장절/원어, 출처 혼합을 검증합니다. 이 검증은 모든 신학적 판단을 자동 보증하는 것은 아닙니다.
- 원문 전문은 공개 콘텐츠에 넣지 않습니다. 공개 문서에는 요약, 1–2개의 짧은 근거 문구(총 300자 이내), URL, 해시와 확인 시각만 저장합니다. 수집 텍스트 캐시는 `.cache/project-sources`에서 관리하며 사이트 빌드에는 포함하지 않습니다.

## 설정

GitHub Secrets: `GEMINI_API_KEY`는 요약 생성에 필요합니다. `GOOGLE_CSE_API_KEY`는 검색 보완용 선택 항목입니다. `GOOGLE_CSE_ID`는 Secrets 또는 Variables에서 읽습니다. API 키를 Variables나 저장소 파일에 넣지 마세요.

Variables의 `READING_JESUS_CHANNEL_ID`는 선택적인 고정 채널 ID입니다. 설정하면 직접 확인된 핸들의 채널 ID와도 일치해야 합니다. 비어 있으면 공식 핸들에서 확인한 ID를 사용합니다. `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`은 기존 설정을 따릅니다.

## 실행

자동 일일 워크플로는 본문 생성 후 보충을 수행합니다. 정상 QT라서 본문 생성을 건너뛰더라도 빠진 관점을 보충합니다. 이미 성공한 관점은 기본적으로 건너뜁니다.

```bash
node scripts/enrich-projects.mjs --dates=2026-09-05,2026-09-06
node scripts/validate.mjs
node scripts/validate-projects.mjs
node scripts/build-site.mjs
```

Actions의 **Supplement project perspectives**에서 기존 날짜(최대 31개)를 지정할 수도 있습니다. 첫 설치 시에는 2026-09-05와 2026-09-06을 보충합니다. `--force` 또는 workflow의 force는 수집 캐시와 성공한 요약을 새로 확인합니다. 실패하더라도 이전 성공한 관점을 없애지 않습니다.

기존 본문, 제목, 날짜, 성서유니온 검증, 생성 시각, 기존 출처는 보존됩니다. 인덱스는 바꾸지 않습니다. Markdown은 관리 마커 구간만 추가/교체합니다. 실제 쓰기 전에 원본 내용이 바뀌지 않았는지 검사합니다.

## 상태와 재시도

수집 상태: `ready`, `metadata_only`, `not_found`, `fetch_failed`, `identity_unverified`, `unsupported_book`, `not_configured`.

요약 상태: `ready`, `missing_api_key`, `failed`, `not_applicable`. 화면은 수집 성공과 요약 성공을 구분합니다. 운영 워크플로 성공은 두 출처 모두 해설을 확보했다는 뜻이 아니며, 개별 상태를 확인해야 합니다.

책 단위 수집 캐시: 해설 성공 7일, 메타데이터 1일, 실패 1시간. 같은 실행에서 같은 책의 자료는 재사용합니다. 수집기 버전, 검색 설정 유무, 고정 채널 ID가 바뀌면 기존 캐시를 재사용하지 않습니다. 요약 성공 기록은 기존 날짜를 임의로 다시 쓰지 않기 위해 유지되며 새로 보려면 force를 사용합니다.

## 검증

`node --test scripts/*.test.mjs`는 외부 네트워크를 사용하지 않는 재현 테스트입니다. 실제 서비스 응답은 Actions 보충 실행의 출처별 상태로 별도 확인합니다. `validate-projects.mjs`는 잘못된 상태/출처/채널 정보, 메타데이터를 해설로 승격한 기록을 배포 전에 거부합니다.
