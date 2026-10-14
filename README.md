<p align="center"><img src="docs/assets/marktext-ai-icon.png" alt="MarkText AI 앱 아이콘" width="128" height="128"></p>

# MarkText AI

**Markdown 문서를 읽고, 직접 쓰고, 채팅으로 고치는 macOS 앱.**

문서를 열고 옆의 AI 채팅창에 “이 문단을 짧게 정리해줘”라고 요청하면 편집 결과가 현재 문서에 바로 반영된다. 채팅에는 짧은 변경 설명과 **되돌리기**가 표시된다. 필요한 모델을 고르고, 채팅창 너비를 조절하며 문서 작업을 이어갈 수 있다.

MarkText AI는 [MarkText](https://github.com/marktext/marktext)를 기반으로 독립적으로 개발·배포하는 커뮤니티 fork다. 기존 Markdown 편집기에 AI 채팅 편집, 일반 문단 들여쓰기, 전용 앱 아이콘을 더했다.

**[Apple Silicon용 설치판 다운로드](https://github.com/yunju-baek/marktext-ai/releases/download/v0.21.2-ai.2/MarkText-AI-0.21.2-ai.2-arm64.dmg)** · [릴리스와 전체 소스](https://github.com/yunju-baek/marktext-ai/releases/tag/v0.21.2-ai.2) · [문제 보고](https://github.com/yunju-baek/marktext-ai/issues)

## 문서에 집중하는 편집

- **Markdown 보기·편집:** 문서를 화면에서 읽으며 바로 수정하고, 소스 모드에서 Markdown 원문을 편집한다.
- **요청하면 바로 반영:** AI가 현재 문서와 최근 대화를 참고해 편집한다. 마지막 AI 편집은 채팅의 되돌리기로 복구할 수 있다.
- **모델 선택:** 로그인한 Codex 계정에서 제공하는 모델을 선택한다. 선택한 모델은 다음 실행에도 유지된다.
- **크기 조절:** 채팅창 왼쪽 경계를 드래그해 좁히거나 넓힌다. 너비는 다음 실행에도 유지되며, 경계를 두 번 클릭하면 기본 너비로 돌아간다.
- **문서별 대화:** 실행 중인 창 안에서 각 문서의 대화와 작성 중인 요청을 유지한다.
- **문단·목록 들여쓰기:** 일반 문단의 들여쓰기와 기존 목록의 하위 목록 편집을 함께 지원한다.

## 설치

첫 공개 미리보기 버전은 **`v0.21.2-ai.2`**다. 설치판의 지원 범위는 **Apple Silicon Mac(M 시리즈), macOS 12 이상**이다.

1. [DMG 설치판](https://github.com/yunju-baek/marktext-ai/releases/download/v0.21.2-ai.2/MarkText-AI-0.21.2-ai.2-arm64.dmg)을 다운로드한다. [ZIP 배포본](https://github.com/yunju-baek/marktext-ai/releases/download/v0.21.2-ai.2/MarkText-AI-0.21.2-ai.2-arm64.zip)도 제공한다.
2. DMG를 열고 **MarkText AI.app**을 **Applications** 폴더로 드래그한다.
3. 응용 프로그램 폴더에서 MarkText AI를 실행하고 Markdown 문서를 연다.

이 배포본은 로컬 **ad-hoc 서명**을 사용하며 Apple Developer ID 서명·공증은 미적용 상태다. 첫 실행에서 개발자 확인 안내가 나타나면 파일의 출처를 확인한 뒤 **시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기**를 선택한다. [Apple 실행 안내](https://support.apple.com/ko-kr/102445).

기본 Markdown 앱으로 설정하려면 Finder에서 `.md` 파일을 선택하고 **⌘I → 다음으로 열기 → MarkText AI → 모두 변경**을 선택한다. `.markdown` 등 다른 확장자도 같은 방식으로 설정한다. [전체 설치 안내](docs/ai-preview/INSTALL.ko.txt).

## AI 연결과 사용

일반 Markdown 보기·편집은 앱 설치 후 바로 사용할 수 있다. AI 채팅은 각 Mac에 별도로 설치한 **Codex CLI**와 사용자의 로그인 계정을 이용한다. 인터넷 연결과 Codex 이용 권한이 필요하며, 계정의 사용 한도가 적용된다. CLI `0.159.2`에서 동작을 확인했다.

Homebrew를 사용하는 Mac에서는 다음 명령으로 준비한다.

```sh
brew install --cask codex
codex login
codex login status
```

[Codex CLI 설치 안내](https://developers.openai.com/codex/cli/)를 참고해 연결을 마친 뒤 앱을 다시 실행한다.

1. 문서를 열고 오른쪽 위 **AI**를 누른다.
2. 입력창 아래에서 모델을 선택한다.
3. “제목을 더 구체적으로 바꿔줘”, “이 문서를 세 문단으로 요약해줘”처럼 요청한다.
4. **Enter**로 보내고 문서에 반영된 결과를 확인한다. 입력창에서 **Shift+Enter**는 줄바꿈이다.

AI 편집 직후에는 채팅의 **되돌리기**를 사용할 수 있다. 이후 직접 편집한 내용까지 되돌리려면 **⌘Z**로 편집 기록을 확인한다. 응답을 기다리는 동안 문서 내용이나 탭을 바꾼 경우에는 현재 문서를 기준으로 다시 요청한다. 파일 저장은 앱의 저장 설정을 따른다.

## Tab과 들여쓰기

| 편집 위치 | Tab                    | Shift+Tab              |
| --------- | ---------------------- | ---------------------- |
| 일반 문단 | 현재 줄 들여쓰기       | 현재 줄 내어쓰기       |
| 목록 항목 | 하위 목록으로 들여쓰기 | 상위 목록으로 내어쓰기 |

일반 문단의 들여쓰기는 줄 앞의 **고정 공백(NBSP, U+00A0)**으로 저장한다. 다시 열 때에도 문단 형식을 유지한다. 코드 블록·표·소스 모드는 각 편집 방식의 기존 동작을 따른다.

## 문서와 대화 데이터

AI 요청에는 **현재 문서 전체와 최근 대화**가 포함되어 선택한 Codex 모델로 전달된다. 문서와 로그인 정보는 각 Mac에서 관리하며, 모델과 채팅창 너비는 로컬에 저장한다. 대화와 작성 중인 요청은 실행 중인 앱 메모리에서 문서별로 유지한다.

- AI에 전달하는 문서: 최대 300,000자.
- 한 번의 편집 요청: 최대 8,000자.
- AI에 전달하는 최근 대화: 최대 10개 메시지, 메시지당 8,000자, 합계 24,000자.
- 응답 대기: 최대 3분.

Codex는 읽기 전용 실행 권한과 도구 비활성화를 적용해 편집 결과를 반환하며, 문서 변경은 앱 편집기가 적용한다. 요청용 임시 파일은 실행 종료 후 정리한다. [상세 사용법과 개발 기록](docs/ai-preview/README.ko.md).

## 소스에서 실행·빌드

macOS Apple Silicon 환경에서 Node.js 20.19 이상, pnpm 10, Xcode Command Line Tools를 준비한다. 저장소에 지정된 pnpm 버전은 `10.33.4`다.

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

결과는 `dist/MarkText-AI-0.21.2-ai.2-arm64.dmg`와 `dist/MarkText-AI-0.21.2-ai.2-arm64.zip`에 생성된다. 공개 배포는 로컬 빌드·검증 후 GitHub Release에 설치판, 수정된 전체 소스, 체크섬을 게시하는 방식이다. 원본 GitHub Actions 워크플로 소스는 보존하며, 이 fork의 Actions 실행은 저장소 설정에서 비활성 상태로 관리한다.

앱 ID는 `local.marktext.ai`이며 설정과 복구 데이터는 `~/Library/Application Support/MarkText AI`에 저장된다. 업데이트는 이 fork의 새 설치판 또는 소스를 다시 빌드해 적용한다.

## 원본 프로젝트와 라이선스

MarkText AI의 기반은 [MarkText v0.21.2](https://github.com/marktext/marktext/tree/v0.21.2), 커밋 [`ae7a869c989950a3a56ce5c2f7fc0df12c652933`](https://github.com/marktext/marktext/commit/ae7a869c989950a3a56ce5c2f7fc0df12c652933)다. 원본 개발자인 Luo Ran과 MarkText Contributors의 작업을 이어 사용한다.

- 원본 저작권: Copyright (c) 2017-present Luo Ran; Copyright (c) 2018-present MarkText Contributors.
- 라이선스: [MIT](LICENSE). 원본 저작권·허가 고지와 [제3자 라이선스 고지](packages/desktop/build/THIRD-PARTY-LICENSES.txt)를 보존한다. [fork 고지](NOTICE).
- 이 배포의 수정 소스: [`v0.21.2-ai.2` 태그](https://github.com/yunju-baek/marktext-ai/tree/v0.21.2-ai.2). 진행 중인 개발 소스: [`main`](https://github.com/yunju-baek/marktext-ai/tree/main).
- 원본 참고 자료: [Markdown 사용 안내](https://marktext.me/docs/markdown-syntax), [개발 문서](https://github.com/marktext/marktext/tree/v0.21.2/packages/website/content/docs/dev).
- 이 fork의 기능 요청·문제 보고: [Issues](https://github.com/yunju-baek/marktext-ai/issues).
