# 2026-09-07 SU 수집 장애: 실행 환경별 연결 비교

## 예약 미시작과 구분

[예약 실행 진단](scheduling.md)은 schedule 이벤트의 run이 생성되지 않았음을 확인했다. 그 내부 원인은 GitHub의 공개된 실행 기록으로 확정할 수 없다. #8의 push 복구 경로는 이 문제를 기다리지 않고 실제 생성을 시작했다.

그러나 [첫 실제 생성 실행](https://github.com/JonathanBlackDoctor/QT/actions/runs/34044196620)은 SU 두 주소에 모두 연결하지 못했다. 따라서 9월 7일 본문을 확인하지 못한 실패 기록을 남겼으며, 새 최종 준비 검사가 이를 실패로 표시했다. 이 단계에서는 Gemini가 해설을 생성하지 않았다. CSE 키/검색 엔진 설정도 없어 검색 fallback은 사용할 수 없었다.

## 대조 실험

[동일 Node 24, 동일 주소, Ubuntu/macOS 비교](https://github.com/JonathanBlackDoctor/QT/actions/runs/34044669196), 2026-09-07 01:12 KST:

| 환경 | :8888/bible/today | 기본 HTTPS /bible/today |
| --- | --- | --- |
| Ubuntu runner | UND_ERR_CONNECT_TIMEOUT, 약 10.5초 | UND_ERR_CONNECT_TIMEOUT, 약 10.5초 |
| macOS runner | HTTP 200, 약 0.77초 | HTTP 404, 약 0.60초 |

두 환경 모두 DNS에서 IPv4 주소를 얻었다. Node 기본 fetch와 IPv4를 명시한 node:https 비교에서도 Ubuntu에서는 제한 시간 내 응답을 받지 못했고 macOS에서는 같은 HTTP 결과가 나왔다. 따라서 단순한 날짜 파싱, IPv6 우선순위, 전체 SU 사이트 중단으로 설명할 수 없는 실행 환경별 연결 차이가 관찰됐다. 서버 측 IP 필터링인지 네트워크 경로 문제인지는 서버/네트워크 로그 없이 단정하지 않는다.

## 적용

일일 생성 워크플로를 실제 연결에 성공한 macos-latest로 이동한다. TLS 검증, 허용 출처, 본문/날짜 검증은 낮추지 않는다. transport 모듈은 원본 오류 메시지·토큰·요청 쿼리를 공개 기록에 복사하지 않고 허용된 DNS/연결/TLS 오류 코드만 남긴다. 수동 QT transport diagnostics 워크플로는 이후 재현용으로 두며 일반 PR마다 외부 요청을 실행하지 않는다.

생성 실행 환경 변경은 예약 이벤트 전달 자체를 고치는 조치가 아니다. #8의 00:05/00:20 및 04:50까지의 복구 슬롯, push 즉시 복구, 게시본 준비 상태 검사는 그대로 유지한다. macOS에서의 최종 성공 여부는 실제 Generate daily QT 실행의 본문 검증·생성·게시본 검사를 기준으로 판단해야 한다.
