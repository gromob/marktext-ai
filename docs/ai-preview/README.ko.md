# MarkText AI

Markdown 문서 옆의 채팅창에서 원하는 수정을 요청하면 현재 문서에 바로 반영한다.

[MarkText](https://github.com/marktext/marktext) v0.21.2를 기반으로 독립적으로 개발·배포하는 커뮤니티 fork다. 첫 공개 미리보기 버전은 [`v0.21.2-ai.2`](https://github.com/yunju-baek/marktext-ai/releases/tag/v0.21.2-ai.2)이다. 수정된 소스는 [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai)의 `main` 브랜치와 각 릴리스 태그에서 확인할 수 있다.

MarkText AI 전용 아이콘을 앱과 공개 저장소에 사용한다. Markdown 보기·직접 편집은 앱 설치 후 바로 사용할 수 있으며, AI 채팅은 Codex CLI 연결 후 사용한다.

## 사용법

1. 문서를 열고 오른쪽 위 **AI**를 누른다.
2. 채팅창에 “두 번째 문단을 짧게 다듬어줘”처럼 요청하고 **Enter**를 누른다. 줄바꿈은 **Shift+Enter**를 사용한다.
3. AI가 현재 문서와 이전 대화를 참고해 편집한다. 반영 결과는 채팅에 짧게 표시된다.
4. 마지막 AI 편집은 채팅의 **되돌리기**로 복구한다. 추가로 직접 편집한 경우 **⌘Z**로 편집 기록을 확인한다.

입력창 아래의 모델 메뉴에서 Codex 계정의 모델을 선택할 수 있다. 선택한 모델은 다음 실행에도 유지된다. 대화와 작성 중인 요청은 창 안에서 문서별로 유지되며, AI 패널을 다시 열어 이어서 사용할 수 있다.

채팅창 왼쪽 경계를 드래그해 너비를 조절한다. 선택한 너비는 다음 실행에도 유지된다. 경계를 두 번 클릭하면 기본 너비로 돌아간다.

본문 편집에서 **Tab**은 일반 문단의 현재 줄을 들여쓰고, **Shift+Tab**은 내어쓴다. 목록 항목에서는 기존처럼 하위 목록으로 들여쓰기와 상위 목록으로 내어쓰기를 적용한다. 일반 문단 들여쓰기는 줄 앞의 고정 공백(NBSP, U+00A0)으로 저장해 다시 열 때도 문단 형식을 유지한다.

AI 응답을 기다리는 동안 문서나 탭을 바꾼 경우, 현재 내용을 기준으로 다시 요청한다. 저장은 앱의 저장 설정을 따른다.

## 연결과 데이터

- 현재 컴퓨터에 설치된 Codex CLI와 `codex login`으로 연결한다.
- 요청 시 현재 문서와 최근 대화가 선택한 Codex 모델로 전달된다. 계정의 Codex 사용 한도가 적용된다.
- 본문 300,000자, 요청 8,000자, 이전 대화 10개·합계 24,000자까지 지원하며, 대화 메시지 하나는 8,000자 이내로 전달한다. 응답 대기 한도는 3분이다.
- 문서 변경은 편집기의 한 번의 편집 작업으로 기록된다. Codex 실행에는 읽기 전용 권한과 도구 비활성화를 적용한다.
- 요청용 임시 파일은 실행 종료 후 정리한다. 모델 ID는 로컬에 저장하며, 채팅은 앱 메모리에서 유지한다.

## 개발

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm -C packages/desktop exec vitest run test/unit/specs/ai-codex.spec.ts test/unit/specs/ai-codex-models.spec.ts test/unit/specs/ai-editor.spec.ts
pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/ai-editing.spec.ts test/e2e/ai-wysiwyg-selection.spec.ts
./scripts/build-ai-mac.sh
```

설치용 DMG는 `dist/MarkText-AI-0.21.2-ai.2-arm64.dmg`, ZIP은 `dist/MarkText-AI-0.21.2-ai.2-arm64.zip`에 생성된다. Apple Silicon Mac과 macOS 12 이상을 대상으로 한다. DMG를 열고 `MarkText AI.app`을 `Applications` 폴더로 드래그한다. [설치 및 AI 연결 안내](INSTALL.ko.txt)를 DMG에도 동봉한다.

빌드는 임시 폴더에서 앱을 패키징하고 로컬 서명을 검증한다. 테스트 파일과 테스트 실행 결과는 개발 저장소에서 관리한다. DMG 생성 후 이미지 무결성을 검사하고 SHA-256 파일을 생성한다. iCloud 동기화 폴더는 앱 번들에 Finder 메타데이터를 추가할 수 있으므로 DMG 또는 ZIP을 배포본으로 사용한다. 이미 빌드한 앱은 `sh scripts/package-ai-dmg.sh`로 DMG를 다시 만들 수 있다.

원본 GitHub Actions 워크플로 소스는 보존한다. 이 fork의 Actions 실행은 저장소 설정에서 비활성 상태로 관리하며, 배포는 로컬 빌드·검증 후 GitHub Release에 설치판과 체크섬을 수동으로 게시한다.

앱 ID는 `local.marktext.ai`, 사용자 설정·복구 경로는 `~/Library/Application Support/MarkText AI`이다. 업데이트는 이 fork의 새 설치판 또는 소스를 다시 빌드해 적용한다.

기반 소스는 [MarkText v0.21.2](https://github.com/marktext/marktext/tree/v0.21.2), 커밋 [`ae7a869c989950a3a56ce5c2f7fc0df12c652933`](https://github.com/marktext/marktext/commit/ae7a869c989950a3a56ce5c2f7fc0df12c652933)이다. Luo Ran과 MarkText Contributors의 원본 저작권 고지 및 [MIT License](../../LICENSE)를 보존한다. [원본 개발 문서](https://github.com/marktext/marktext/tree/v0.21.2/packages/website/content/docs/dev)도 참고할 수 있다.

## 공개 준비 이전의 로컬 검증 기록

2026-10-14: 단위 테스트 27개, Electron 화면 테스트 10개, TypeScript 검사를 통과했다. ESLint는 오류 0개이며 기반 프로젝트의 경고 166개가 남아 있다. 실제 Codex 모델로 이전 대화를 전달한 후속 편집과 짧은 변경 설명의 반환을 확인했다. macOS Apple Silicon 앱 빌드와 설치본의 코드 서명 검증도 완료했다. 설치된 앱의 채팅에서 GPT-6.1-Sol로 안내 문서 제목을 바꾸고, 되돌리기로 원문을 복구하는 흐름을 직접 확인했다.

문단 들여쓰기 추가 검증: 문단·목록 Electron 화면 테스트 8개와 한글 입력 조합 보호 테스트 2개를 통과했다. 편집 엔진의 들여쓰기·실행 취소·선택 복원 관련 테스트도 통과했다. 일반 문단의 Tab·Shift+Tab, 한글 입력, 저장 후 재실행, 기존 목록 중첩을 확인했다.

설치판 검증: DMG 무결성 검사와 SHA-256 대조를 통과했다. DMG에서 복사한 앱의 코드 서명을 확인하고, 별도 사용자 설정으로 실행해 한국어 Markdown 문서 표시와 AI 연결 인터페이스 로딩을 확인했다. 이 실행에서 렌더러 오류는 0개였다. 배포 앱에는 런타임 파일만 포함하며 인증 파일과 개인 경로 검사도 통과했다.

공개 준비 빌드 `0.21.2-ai.1` 검증: AI 단위 테스트 27개, TypeScript 검사와 ESLint(오류 0개)를 통과했다. 새 DMG에서 복사한 앱의 버전·라이선스 동봉·코드 서명을 검사하고, 별도 사용자 설정으로 문서 열기와 AI 채팅창·모델 선택 UI 표시를 확인했다. 렌더러 오류는 0개였고, DMG·ZIP 무결성과 SHA-256 대조를 통과했다.
