# QT

매일 **00:15 KST**에 성서유니온 「매일성경」 본문을 확인하고, 검증된 자료만 사용해 Gemini로 큐티 해설을 생성하여 Git에 보관하고 GitHub Pages에 공개하는 정적 사이트입니다.

## 핵심 원칙

- 날짜는 자동 실행 시 **KST 달력 날짜를 명시적 날짜로 사용**합니다. 따라서 원래 프롬프트의 04:00 경계 규칙과 충돌하지 않습니다.
- 먼저 `https://sum.su.or.kr:8888/bible/today`를 **직접 요청**합니다.
- 직접 확인하지 못한 필드는 검색 fallback으로만 보완하며, 직접 확인과 검색 확인을 구분합니다.
- 검색 fallback과 추가 연구에는 Google Programmable Search(JSON API)를 사용합니다.
- 실제로 가져온 문서/검색 스니펫을 Evidence Bundle로 만든 뒤 그 증거만 Gemini에 전달합니다.
- 출력에 사용된 URL은 화이트리스트 + 실제 Evidence Bundle 안에 존재하는 URL인지 검증합니다.
- 본문을 식별하지 못하면 AI가 추측하지 않고 **실패 기록**을 남깁니다.
- 같은 날짜는 기본적으로 다시 생성하지 않습니다. 수동 실행에서 `force=true`로만 재생성합니다.

## 필요한 GitHub Secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret**에서 설정합니다.

- `GEMINI_API_KEY` — 필수
- `GOOGLE_CSE_API_KEY` — 검색 fallback용, 권장
- `GOOGLE_CSE_ID` — 검색 fallback용, 권장

선택적으로 Repository → **Settings → Secrets and variables → Actions → Variables**에서 모델을 바꿀 수 있습니다.

- `GEMINI_MODEL` — 기본값 `gemini-3.8-flash`
- `GEMINI_FALLBACK_MODEL` — 기본값 `gemini-2.5-pro`

최신 안정판인 Gemini 3.8 Flash를 기본으로 쓰고, 호출 실패 시 안정적인 Gemini 2.5 Pro로 자동 fallback합니다. 매일 한 번의 Evidence Bundle 기반 생성에서는 최신 지시 준수 성능과 비용 효율을 우선하고, 장애·호환성 문제 때는 Pro 계열로 안전하게 내려갑니다.

Google 검색 키가 없더라도 성서유니온 직접 접근으로 본문을 확인할 수 있으면 생성할 수 있습니다. 다만 직접 접근 실패 시 검색 fallback을 수행할 수 없고, 추가 화이트리스트 연구 자료도 제한됩니다.

## GitHub Pages — 최초 1회 설정

새 저장소에서는 Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**를 한 번 선택해야 합니다. 현재 연결된 자동화 토큰은 새 Pages 사이트 자체를 생성할 권한이 없으므로 이 최초 활성화만 GitHub UI에서 수행합니다.

활성화 뒤 `Deploy Pages` 또는 `Generate daily QT` workflow가 사이트를 배포합니다.

예상 주소:

`https://JonathanBlackDoctor.github.io/QT/`

## 수동 생성

Actions → **Generate daily QT → Run workflow**

- `date`: 예) `2026-09-07`
- `force`: 기존 날짜를 다시 만들 때만 체크

로컬에서는:

```bash
GEMINI_API_KEY=... GOOGLE_CSE_API_KEY=... GOOGLE_CSE_ID=... \
  node scripts/generate.mjs --date=2026-09-07
node scripts/validate.mjs --date=2026-09-07
node scripts/build-site.mjs
```

## 저장 형식

```text
content/YYYY/MM/YYYY-MM-DD.json  # 웹이 읽는 정규 데이터
content/YYYY/MM/YYYY-MM-DD.md    # 사람이 읽기 쉬운 보관본
content/index.json               # 날짜/본문/상태 인덱스
```

실패한 날도 JSON/Markdown 기록을 남겨 누락이 조용히 사라지지 않게 합니다.

## 자동 실행 시각

GitHub Actions cron은 UTC 기준이므로 다음을 사용합니다.

```yaml
- cron: '15 15 * * *'
```

이는 **15:15 UTC = 다음 날 00:15 KST**입니다. GitHub Actions의 scheduled workflow는 서비스 상황에 따라 실제 시작이 몇 분 늦어질 수 있습니다.
