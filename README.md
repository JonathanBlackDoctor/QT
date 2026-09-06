# QT

매일 **00:05 KST**에 성서유니온 「매일성경」 본문을 확인하고, 검증된 자료만 사용해 Gemini로 큐티 해설을 생성하여 Git에 보관하고 GitHub Pages에 공개하는 정적 사이트입니다. **00:20 KST**에 첫 복구를 시도하고, 누락 시 **04:50 KST까지 15분 간격의 추가 복구 슬롯**을 사용합니다. 정상 해설은 다시 생성하지 않으며, 파일은 정상인데 공개 사이트만 오래된 경우 배포만 복구합니다. 00:20에는 기존 프로젝트 관점 보완 재시도도 유지합니다.

**첫 화면의 날짜는 한국시간 04:00에 전환됩니다.** 화요일 03:00에는 월요일 QT, 04:00부터 화요일 QT를 기본 표시합니다. 날짜를 직접 선택한 링크는 이 기본값보다 우선합니다. 생성 시각과 첫 화면 전환 시각은 별개입니다. [예약 실행 진단 및 복구 동작](docs/scheduling.md)

## 핵심 원칙

- 생성은 **KST 달력 날짜**, 홈페이지 기본 선택은 **04:00 경계의 묵상 날짜**를 사용합니다. 자정 직후 다음 묵상일의 해설을 준비해도 첫 화면을 조기에 바꾸지 않습니다.
- 먼저 `https://sum.su.or.kr:8888/bible/today`를 **직접 요청**하고, 일시적인 네트워크 실패에는 재시도합니다.
- 직접 확인하지 못한 필드는 검색 fallback으로만 보완하며, 직접 확인과 검색 확인을 구분합니다.
- 검증된 본문에서 주소를 결정할 수 있는 BibleHub 장별 주석/원문 분석 페이지는 검색 키 없이도 직접 열어 추가 Evidence로 사용합니다.
- Google Programmable Search(JSON API)는 성서유니온 fallback 및 BibleProject·대한성서공회·Blue Letter Bible·NET Bible·TGC 등 더 넓은 화이트리스트 연구를 위한 **선택 기능**입니다.
- 실제로 가져온 문서/검색 스니펫을 Evidence Bundle로 만든 뒤 그 증거만 Gemini에 전달합니다.
- 출력에 사용된 URL은 화이트리스트 + 실제 Evidence Bundle 안에 존재하는지 검증합니다.
- 생성문에 등장하는 **다른 성경 장절 주소와 히브리어·헬라어 철자도 Evidence Bundle 안에 실제로 존재해야** 합니다. 위반하면 결과를 거부하고 한 차례 근거 준수 재생성을 시도합니다.
- 그리스도 중심 연결은 `명시적 신약 근거 → 강한 정경적·신학적 연결 → 가능한 예표적 공명`의 근거 수준을 구분하며, 근거 없는 예표/성취 단정을 금지합니다.
- 본문을 식별하지 못하면 AI가 추측하지 않고 **실패 기록**을 남깁니다. 워크플로의 최종 준비 상태 검사는 이를 성공으로 처리하지 않습니다.
- 같은 날짜의 정상 결과는 기본적으로 다시 생성하지 않습니다. 실패/불완전 기록은 복구 실행에서 다시 시도하며, 정상 결과를 수동으로 재생성하려면 `force=true`를 사용합니다.

## 필요한 GitHub Secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret**에서 설정합니다.

- `GEMINI_API_KEY` — 필수
- `GOOGLE_CSE_API_KEY` — 검색 fallback/추가 연구용, 선택
- `GOOGLE_CSE_ID` — 검색 fallback/추가 연구용, 선택

선택적으로 Repository → **Settings → Secrets and variables → Actions → Variables**에서 모델을 바꿀 수 있습니다.

- `GEMINI_MODEL` — 기본값 `gemini-3.8-flash`
- `GEMINI_FALLBACK_MODEL` — 기본값 `gemini-2.5-pro`

Gemini 모델 기본값은 저장소의 생성 코드에 설정되어 있으며, 호출 실패 시 fallback 모델을 시도합니다.

Google CSE 키가 없어도 성서유니온 직접 확인이 성공하면 **성서유니온 + 본문에서 결정적으로 계산 가능한 BibleHub 직접 자료**를 바탕으로 생성할 수 있습니다. 다만 성서유니온 직접 접근 자체가 실패하면 CSE 검색 fallback으로 본문을 복구할 수 없으므로 그 실행은 추측하지 않고 실패 처리되며, 복구 실행이 다시 시도합니다. 또한 CSE가 없으면 BibleProject/TGC/NET Bible 등 더 넓은 출처의 자동 탐색은 제한됩니다.

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
- cron: '20 15 * * *' # 00:20 KST 첫 복구
- cron: '35,50 15 * * *' # 00:35, 00:50 KST
- cron: '5,20,35,50 16-19 * * *' # 01:05~04:50 KST 추가 복구
```

예약 시각은 생성 시작 목표이며 게시 완료 보장 시각이 아닙니다. 파이프라인 파일을 main에 수정하면 그날 누락분을 즉시 점검하는 push 트리거도 실행됩니다. 예약 실행 자체가 만들어지지 않는 서비스 측 상황은 이 저장소의 재시도 코드만으로 완전히 제거할 수 없으며, 진단 결과와 한계는 [운영 문서](docs/scheduling.md)에 기록합니다.
