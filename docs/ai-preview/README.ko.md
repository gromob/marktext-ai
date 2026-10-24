# MarkText Local (AJ)

프로젝트 별칭은 **AJ**다. 기존 AI를 수열의 항 $A_i$로 보고 그 변형을 $A_j$로 표현한다. 앱 아이콘은 M의 오른쪽 발을 단순한 칩으로 바꿔 로컬 AI 지원을 나타낸다.

Markdown 문서 옆의 채팅창에서 질문하거나 문서 수정을 요청한다. 기존 Codex 연결을 유지하면서 로컬 OpenAI 호환 서버를 선택할 수 있다.

이 작업은 [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai)의 `v0.21.2-ai.2`, 커밋 `7cd32b04`를 기준으로 한다. 그 프로젝트는 [MarkText](https://github.com/marktext/marktext) v0.21.2를 기반으로 한 커뮤니티 fork다. 개선 작업 저장소는 [gromob/marktext-ai](https://github.com/gromob/marktext-ai)다.

현재는 공개 준비 단계다. 기준 공개 버전과 이번 변경을 구분하며, 새 공개 릴리스의 버전·태그와 설치판은 별도로 확정한다.

## 변경 내용

- macOS 한글→한자 변환 중복, 불필요한 문단 분리, 실행 취소·커서 복원을 수정했다.
- Codex와 로컬 AI 연결을 선택하고, 로컬 서버·모델을 직접 추가·수정·삭제할 수 있다.
- 로컬 모델의 일반 질문 답변과 Markdown 편집을 구분하고, 오류나 오래된 응답으로 문서를 변경하지 않는다.
- AI 창의 대화·입력·메뉴 글꼴 크기를 함께 조절하며 Preferences와 연동한다.

## 사용법

1. 문서를 열고 오른쪽 위 **AI**를 누른다.
2. **Codex / 로컬 AI** 연결과 사용할 모델을 선택한다. 로컬 서버는 **서버·모델 관리**에서 등록한다.
3. 채팅창에 요청을 입력하고 **Enter**를 누른다. 줄바꿈은 **Shift+Enter**를 사용한다.
4. 일반 질문은 채팅으로 답하고 문서 수정 요청은 본문에 적용한다. 마지막 AI 편집은 채팅의 **되돌리기** 또는 편집기 실행 취소로 복구한다.

로컬 서버 주소·키·모델 등록과 삭제는 [로컬 AI 연결 안내](LOCAL-AI.ko.md)를 참고한다. 서버 실행과 모델 로딩은 사용자가 담당하며 실패 시 다른 모델로 자동 전환하지 않는다.

AI 창의 **A− / A+** 또는 **Preferences → Editor → AI 창 글꼴 크기**에서 12–24px로 조절한다. 대화·입력창·연결 및 모델 메뉴·서버 관리에 함께 적용하며 다음 실행에도 유지한다. 창 왼쪽 경계를 드래그해 너비를 조절하고, 두 번 클릭해 기본 너비로 되돌릴 수 있다.

일반 문단에서 **Tab / Shift+Tab**은 들여쓰기·내어쓰기를 적용하고, 목록에서는 기존 목록 중첩을 조절한다. 일반 문단 들여쓰기는 줄 앞의 고정 공백(NBSP, U+00A0)으로 저장한다.

## 연결과 데이터

Codex는 대상 Mac의 CLI 설치와 로그인을 사용한다. 로컬 AI는 지정한 서버의 `/v1/models`와 `/v1/chat/completions`를 사용한다. 요청 시 현재 문서 전체와 최근 대화가 선택한 연결로 전달된다.

로컬 서버용 API 키는 사용자 선택에 따라 앱 프로필에 **평문으로 저장**하며 키체인을 사용하지 않는다. 화면과 설정 조회 응답에는 저장된 키를 반환하지 않는다. 이전 암호화 키는 한 번 다시 입력해야 한다. Codex 인증 저장 방식은 변경하지 않는다.

본문은 최대 300,000자, 요청은 8,000자, 최근 대화는 최대 10개·합계 24,000자다. 대화 메시지 하나는 8,000자까지 전달하며 편집 응답은 3분까지 기다린다. 요청 중 문서나 탭이 바뀌면 오래된 결과를 적용하지 않는다. 대화와 작성 중인 요청은 실행 중인 창에서 문서별로 유지된다.

## 개발과 검사

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm -C packages/desktop exec vitest run test/unit/specs/ai-codex.spec.ts test/unit/specs/ai-codex-models.spec.ts test/unit/specs/ai-editor.spec.ts test/unit/specs/ai-local.spec.ts test/unit/specs/ai-connection.spec.ts test/unit/specs/ai-local-model-options.spec.ts
pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/ai-editing.spec.ts test/e2e/ai-wysiwyg-selection.spec.ts test/e2e/ai-local-editing.spec.ts test/e2e/ai-font-size.spec.ts
```

[최종 통합 검사 기록](INTEGRATION-VALIDATION.ko.md): 2026-10-24 관련 단위 159개와 E2E 47개, 총 206개가 통과했다. 타입·린트·빌드도 확인했다. [로컬 AI 검증 범위](LOCAL-AI.ko.md#검증-범위)와 [한자 입력 검증 기록](HANJA-IME-VALIDATION.ko.md)을 구분하며 실제 macOS IME 확인은 합성 입력 자동 검사만으로 대체하지 않는다. 공개용 버전·태그와 해당 설치판 빌드는 후속 단계다.

## 설치판 빌드

```sh
./scripts/build-ai-mac.sh
```

Apple Silicon Mac과 macOS 12 이상을 대상으로 `.app`·DMG·ZIP을 `dist/`에 생성한다. 파일 이름은 패키지 버전에 따라 `MarkText-Local-<version>-arm64`를 사용한다. 현재 패키지 번호는 기준 `0.21.2-ai.2`를 유지한 로컬 검증용이며, 공개 설치판에는 새 버전을 사용해야 한다.

빌드 스크립트는 임시 폴더에서 패키징하고 로컬 코드 서명·DMG 무결성을 검사하며 SHA-256 파일을 생성한다. 서명은 ad-hoc이고 Apple Developer ID 서명·공증은 적용하지 않았다. [설치 안내](INSTALL.ko.txt)를 DMG에 동봉한다. 소스는 Git으로, 설치판은 검토 후 GitHub Release 첨부 파일로 공개한다.

표시 이름은 **MarkText Local**이다. 기존 설정을 유지하기 위해 앱 ID는 `local.marktext.ai`, 사용자 설정·복구 경로는 `~/Library/Application Support/MarkText AI`다. 사용자 문서·서버 키·앱 프로필·개인 도구 설정은 소스나 설치판에 포함하지 않는다.

## 기반과 라이선스

기반 AI 프로젝트: [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai), 기준 릴리스 [`v0.21.2-ai.2`](https://github.com/yunju-baek/marktext-ai/releases/tag/v0.21.2-ai.2).

원본 기반: [MarkText v0.21.2](https://github.com/marktext/marktext/tree/v0.21.2), 커밋 `ae7a869c989950a3a56ce5c2f7fc0df12c652933`.

Luo Ran과 MarkText Contributors의 저작권 고지 및 [MIT License](../../LICENSE), [NOTICE](../../NOTICE)를 보존한다. [원본 개발 문서](https://github.com/marktext/marktext/tree/v0.21.2/packages/website/content/docs/dev)와 기여 지침도 함께 참고한다.

## 이름·아이콘 적용 확인 (2026-10-24)

MarkText Local 이름과 M·칩 아이콘을 적용했다. AJ는 프로젝트 별칭이다. 타입 검사, 변경한 TS/Vue 파일 ESLint, 빌드 스크립트 구문 검사와 앱 시작·AI 글꼴 설정 E2E 2개가 통과했다. macOS arm64 앱·ZIP·DMG를 빌드했고 코드 서명 검사와 DMG 무결성 검사가 통과했다. 패키지의 표시 이름·실행 파일 이름 및 ICNS 일치도 확인했다. 이번 이름·아이콘 변경 후 전체 206개 검사를 다시 실행한 것은 아니다. 기존 설치 앱 교체와 공개 배포는 하지 않았다.
