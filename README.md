# QT

매일 **00:05 KST**에 성서유니온 「매일성경」 본문을 확인하고, 검증된 자료만 사용해 Gemini로 큐티 해설을 생성하여 Git에 보관하고 GitHub Pages에 공개하는 정적 사이트입니다. 첫 실행에서 외부 사이트 확인이 실패한 경우 **00:20 KST**에 자동 복구 실행을 한 번 더 시도합니다. 이미 정상 생성된 날짜는 두 번째 실행에서 모델 호출 없이 즉시 건너뜁니다.

## 핵심 원칙

- 날짜는 자동 실행 시 **KST 달력 날짜를 명시적 날짜로 사용**합니다. 따라서 원래 프롬프트의 04:00 경계 규칙과 충돌하지 않습니다.
- 먼저 `https://sum.su.or.kr:8888/bible/today`를 **직접 요청**하고, 일시적인 네트워크 실패에는 재시도합니다.
- 직접 확인하지 못한 필드는 검색 fallback으로만 보완하며, 직접 확인과 검색 확인을 구분합니다.
- 검증된 본문에서 주소를 결정할 수 있는 BibleHub 장별 주석/원문 분석 페이지는 검색 키 없이도 직접 열어 추가 Evidence로 사용합니다.
- Google Programmable Search(JSON API)는 성서유니온 fallback 및 BibleProject·대한성서공회·Blue Letter Bible·NET Bible·TGC 등 더 넓은 화이트리스트 연구를 위한 **선택 기능**입니다.
- 실제로 가져온 문서/검색 스니펫을 Evidence Bundle로 만든 뒤 그 증거만 Gemini에 전달합니다.
- 출력에 사용된 URL은 화이트리스트 + 실제 Evidence Bundle 안에 존재하는지 검증합니다.
- 생성문에 등장하는 **다른 성경 장절 주소와 히브리어·헬라어 철자도 Evidence Bundle 안에 실제로 존재해야** 합니다. 위반하면 결과를 거부하고 한 차례 근거 준수 재생성을 시도합니다.
- 그리스도 중심 연결은 `명시적 신약 근거 → 강한 정경적·신학적 연결 → 가능한 예표적 공명`의 근거 수준을 구분하며, 근거 없는 예표/성취 단정을 금지합니다.
- 본문을 식별하지 못하면 AI가 추측하지 않고 **실패 기록**을 남깁니다.
- 같은 날짜의 `status: ok` 결과는 기본적으로 다시 생성하지 않습니다. 실패/불완전 기록은 다음 복구 실행에서 다시 시도하며, 정상 결과를 수동으로 재생성하려면 `force=true`를 사용합니다.

## 필요한 GitHub Secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret**에서 설정합니다.

- `GEMINI_API_KEY` — 필수
- `GOOGLE_CSE_API_KEY` — 검색 fallback/추가 연구용, 선택
- `GOOGLE_CSE_ID` — 검색 fallback/추가 연구용, 선택

선택적으로 Repository → **Settings → Secrets and variables → Actions → Variables**에서 모델을 바꿀 수 있습니다.

- `GEMINI_MODEL` — 기본값 `gemini-3.8-flash`
- `GEMINI_FALLBACK_MODEL` — 기본값 `gemini-2.5-pro`

최신 안정판인 Gemini 3.8 Flash를 기본으로 쓰고, 호출 실패 시 안정적인 Gemini 2.5 Pro로 자동 fallback합니다. 매일 한 번의 Evidence Bundle 기반 생성에서는 지시 준수 성능과 비용 효율을 우선하고, 장애·호환성 문제 때는 Pro 계열로 안전하게 내려갑니다.

Google CSE 키가 없어도 성서유니온 직접 확인이 성공하면 **성서유니온 + 본문에서 결정적으로 계산 가능한 BibleHub 직접 자료**를 바탕으로 생성할 수 있습니다. 다만 성서유니온 직접 접근 자체가 실패하면 CSE 검색 fallback으로 본문을 복구할 수 없으므로 그 실행은 추측하지 않고 실패 처리되며, 00:20 KST 복구 실행이 다시 시도합니다. 또한 CSE가 없으면 BibleProject/TGC/NET Bible 등 더 넓은 출처의 자동 탐색은 제한됩니다.

## GitHub Pages — 최초 1회 설정

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**를 선택합니다.

활성화 뒤 `Deploy Pages` 또는 `Generate daily QT` workflow가 사이트를 배포합니다.

공개 주소:

`https://JonathanBlackDoctor.github.io/QT/`

## 수동 생성

Actions → **Generate daily QT → Run workflow**

- `date`: 예) `2026-09-07`
- `force`: 기존 정상 날짜를 다시 만들 때만 체크

로컬에서는:

```bash
GEMINI_API_KEY=... GOOGLE_CSE_API_KEY=... GOOGLE_CSE_ID=... \
  node scripts/generate.mjs --date=2026-09-07
node scripts/validate.mjs --date=2026-09-07
node scripts/build-site.mjs
```

Google CSE를 쓰지 않는 경우 두 CSE 환경변수는 생략할 수 있습니다.

## 저장 형식

```text
content/YYYY/MM/YYYY-MM-DD.json  # 웹이 읽는 정규 데이터
content/YYYY/MM/YYYY-MM-DD.md    # 사람이 읽기 쉬운 보관본
content/index.json               # 날짜/본문/상태 인덱스
```

실패한 날도 JSON/Markdown 기록을 남겨 누락이 조용히 사라지지 않게 합니다. 이후 복구 실행이 성공하면 같은 날짜의 실패 기록을 정상 결과로 교체합니다.

## 자동 실행 시각

GitHub Actions cron은 UTC 기준입니다.

```yaml
- cron: '5 15 * * *' # 00:05 KST
- cron: '20 15 * * *' # 00:20 KST 복구 실행
```

GitHub Actions의 scheduled workflow는 서비스 상황에 따라 실제 시작이 몇 분 늦어질 수 있습니다.
