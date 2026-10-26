# F1 — 로컬 AI HTTP 대기 제한 수정

검증일: 2026-10-26 (Asia/Seoul)

## 원인과 수정

`LocalRewriter`의 앱 타이머를 600초로 늘려도 Node fetch/Undici의 별도 헤더·본문 대기 제한(기본 300초)은 바뀌지 않았다. 실제 Electron 42.1.0 / Node 24.15.0 / Undici 7.24.4에서 응답 헤더가 없는 로컬 시험 요청은 약 301초 후 `UND_ERR_HEADERS_TIMEOUT`으로 실패했으며 앱 AbortSignal은 아직 취소되지 않았다.

로컬 AI 전송을 기존 의존성 Axios의 Node `http` 어댑터로 분리했다. 별도 HTTP timeout을 두지 않고 호출자의 AbortSignal로 연결·헤더·본문 수신 전체의 기한과 사용자 취소를 제어한다. 모델별 대기 시간과 모델 목록 조회 15초 제한은 기존 `LocalRewriter` 타이머를 그대로 사용한다.

`maxRedirects: 0`으로 리디렉션을 따라가지 않고 응답을 스트림으로 읽어 기존 2,000,000바이트 한도를 유지한다. 글로벌 HTTP dispatcher는 변경하지 않는다. HTTP 전송 오류의 진단 코드를 이용해 네트워크 시간 초과를 일반 연결 실패와 구분한다. 전송 시작 단계 Axios 오류에서는 요청 헤더가 포함된 원본 설정을 전달하지 않고 코드만 보존한다.

의존성·lockfile, Codex 전송, 문맥 설정의 저장 정책은 변경하지 않았다. 리뷰 F2 및 Codex 문맥 제약 L1은 이번 수정 범위 밖이며 아직 남아 있다.

## 변경 파일

- `packages/desktop/src/main/ai/localHttp.ts`: Node HTTP 어댑터와 응답 스트림 연결.
- `packages/desktop/src/main/ai/local.ts`: 새 전송 사용, 시간 초과 오류 분류.
- `packages/desktop/test/unit/specs/ai-local-http.spec.ts`: 실제 소켓 회귀 검사 9개.
- `packages/desktop/test/unit/specs/ai-local.spec.ts`: 전송 mock 조정, HTTP 시간 초과 분류 검사 2개 추가.

## 결과

- 관련 단위 검사 70개 통과: 기존 59개 + 실제 소켓 검사 9개 + 시간 초과 분류 검사 2개.
- Electron E2E 17개 통과.
- 타입 검사·변경 파일 ESLint 통과.
- macOS arm64 앱·ZIP·DMG 빌드, 서명·DMG 무결성 검사 통과.
- 실제 Electron 실행 파일을 Node 모드로 구동하고 새 `LocalRewriter` 전송 경로에 응답 헤더를 310초 지연하는 로컬 가짜 HTTP 서버를 연결했다. 앱 제한 600초에서 **310초 후 성공**, 답변 수신, 글로벌 fetch 호출 0회를 확인했다.
- 짧은 소켓 검사에서는 헤더 대기와 본문 정지 각각의 기한 만료, 두 단계에서 사용자 취소, 요청 슬롯 해제, 리디렉션 차단, 본문 크기 제한, 연결 거부, 본문 없는 HTTP 상태를 확인했다.

OpenCode의 확인된 Strata 모델에 두 파일만 전달하여 읽기 전용 검사 범위 요약을 위임했다. 실제 코드와 대조해 8개 테스트 선언이 `it.each`를 포함하여 9개 소켓 검사로 실행됨을 확인했다. 310초 실측과 최종 판정은 Codex가 수행했다. 첫 위임 준비는 첨부 파일 생성 경로 오류로 모델 호출 전에 실패했고, 경로 수정 후 한 번 정상 실행했다. 다른 모델로 전환하지 않았다.

## 범위와 상태

실제 Strata·Splash 추론 서버는 이 기능 검증에 사용하지 않았다. 가짜 서버로 클라이언트의 5분 제한 해소를 확인한 것이며 실제 모델·서버의 처리 속도나 서버 자체의 제한까지 보장하지 않는다. 검증 당시 기존 설치 앱을 자동 교체하지 않았고 커밋·푸시는 하지 않았다. 이후 작업 브랜치 저장 여부는 Git 이력을 확인한다. 기존 리뷰 ZIP은 수정 전 스냅샷으로 보존한다.
