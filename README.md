# MarkText AI

Markdown 문서 옆의 작은 채팅창에서 수정을 요청하고, 결과를 문서에 바로 반영하는 macOS 편집기다.

**MarkText AI는 [MarkText](https://github.com/marktext/marktext)를 기반으로 독립적으로 개발·배포하는 커뮤니티 fork다.** 원본 [v0.21.2](https://github.com/marktext/marktext/tree/v0.21.2), 커밋 [`ae7a869c989950a3a56ce5c2f7fc0df12c652933`](https://github.com/marktext/marktext/commit/ae7a869c989950a3a56ce5c2f7fc0df12c652933)에 AI 편집과 문단 들여쓰기를 추가했다. 원본 개발자인 Luo Ran과 MarkText Contributors의 작업을 이어 사용한다.

## 설치

첫 공개 미리보기 버전은 **`v0.21.2-ai.1`**이며, 설치판의 지원 범위는 **Apple Silicon Mac(M 시리즈), macOS 12 이상**이다.

- **[DMG 설치판 다운로드](https://github.com/yunju-baek/marktext-ai/releases/download/v0.21.2-ai.1/MarkText-AI-0.21.2-ai.1-arm64.dmg)**
- [ZIP 다운로드](https://github.com/yunju-baek/marktext-ai/releases/download/v0.21.2-ai.1/MarkText-AI-0.21.2-ai.1-arm64.zip)
- [릴리스·체크섬·수정된 전체 소스](https://github.com/yunju-baek/marktext-ai/releases/tag/v0.21.2-ai.1)

DMG를 열고 **MarkText AI.app → Applications**로 드래그한다. 이 배포본은 로컬 ad-hoc 서명을 사용하며, Apple Developer ID 서명·공증은 미적용 상태다. 첫 실행에서 개발자 확인 안내가 나타나면 파일의 출처를 확인한 뒤 **시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기**를 선택한다. [Apple 실행 안내](https://support.apple.com/ko-kr/102445), [전체 설치 안내](docs/ai-preview/INSTALL.ko.txt).

일반 Markdown 보기·편집은 앱 설치 후 바로 사용할 수 있다. 기본 `.md` 앱은 Finder에서 파일을 선택한 뒤 **⌘I → 다음으로 열기 → MarkText AI → 모두 변경**으로 설정한다.

## 추가한 기능

- **AI 채팅 편집:** 현재 문서와 최근 대화를 참고해 요청한 수정을 문서에 반영한다. 채팅에 변경 설명과 되돌리기를 표시한다.
- **모델 선택:** 해당 Mac의 Codex 계정에서 사용할 수 있는 모델을 선택한다.
- **작은 채팅창:** 왼쪽 경계를 드래그해 너비를 조절하고, 선택한 너비를 다음 실행에도 유지한다.
- **일반 문단 들여쓰기:** Tab은 들여쓰기, Shift+Tab은 내어쓰기다. 줄 앞의 고정 공백(NBSP, U+00A0)으로 저장해 Markdown 문단 형식을 유지한다.
- **목록 편집:** 목록 항목의 Tab은 기존처럼 하위 목록으로, Shift+Tab은 상위 목록으로 이동한다. 코드 블록·표·소스 모드는 각 편집 방식의 기존 동작을 따른다.

## AI 연결

AI 기능은 각 Mac에 별도로 설치한 **Codex CLI**와 사용자가 로그인한 계정을 이용한다. 인터넷 연결과 Codex 이용 권한이 필요하며 계정의 사용 한도가 적용된다. CLI `0.159.2`에서 동작을 확인했다.

Homebrew를 사용하는 Mac에서는 다음 명령으로 준비한다.

```sh
brew install --cask codex
codex login
codex login status
```

[Codex CLI 설치 안내](https://developers.openai.com/codex/cli/)를 참고해 연결을 마친 뒤 앱을 다시 실행한다. 문서 오른쪽 위 **AI**를 누르고, 모델을 선택한 다음 채팅에 편집 요청을 입력한다. **Enter**는 요청, **Shift+Enter**는 줄바꿈이다.

요청 시 현재 문서와 최근 대화가 선택한 Codex 모델로 전달된다. 문서와 로그인 정보는 각 Mac에서 관리한다. 모델과 패널 너비는 로컬에 저장하며, 채팅은 실행 중인 앱 메모리에서 문서별로 유지한다. [사용법·데이터 처리 범위](docs/ai-preview/README.ko.md).

## 소스에서 빌드

macOS Apple Silicon 환경에서 Node.js 20.19 이상과 pnpm 10을 준비한다. 저장소에 지정된 pnpm 버전은 `10.33.4`다. 네이티브 모듈 빌드에는 Xcode Command Line Tools가 필요하다.

```sh
git clone https://github.com/yunju-baek/marktext-ai.git
cd marktext-ai
pnpm install --frozen-lockfile
pnpm run dev
```

검사와 설치판 빌드:

```sh
pnpm run typecheck
pnpm run lint
./scripts/build-ai-mac.sh
```

결과는 `dist/MarkText-AI-0.21.2-ai.1-arm64.dmg`와 `dist/MarkText-AI-0.21.2-ai.1-arm64.zip`에 생성된다. [개발·검증 기록](docs/ai-preview/README.ko.md)과 [원본 개발 문서](https://github.com/marktext/marktext/tree/v0.21.2/packages/website/content/docs/dev)를 참고할 수 있다.

원본 GitHub Actions 워크플로 소스는 보존하며, 이 fork의 Actions 실행은 저장소 설정에서 비활성 상태로 관리한다. 공개 배포는 로컬 빌드·검증 후 GitHub Release에 설치판과 체크섬을 수동으로 게시하는 방식이다.

## 원본 프로젝트와 라이선스

- 원본: [marktext/marktext](https://github.com/marktext/marktext), [사용자 문서](https://marktext.me/docs/markdown-syntax)
- 원본 저작권: Copyright (c) 2017-present Luo Ran; Copyright (c) 2018-present MarkText Contributors
- 라이선스: [MIT](LICENSE). 원본 저작권·허가 고지와 [제3자 라이선스 고지](packages/desktop/build/THIRD-PARTY-LICENSES.txt)를 보존한다.
- 이 fork의 수정 소스와 배포: [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai)
- 이 fork의 기능 요청·문제 보고: [Issues](https://github.com/yunju-baek/marktext-ai/issues)
