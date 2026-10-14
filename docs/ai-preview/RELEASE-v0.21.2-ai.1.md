# MarkText AI v0.21.2-ai.1

**첫 공개 미리보기 배포본(Pre-release)**이다. Apple Silicon Mac(M 시리즈), macOS 12 이상에서 사용한다.

MarkText AI는 [marktext/marktext](https://github.com/marktext/marktext)를 기반으로 독립적으로 개발·배포하는 커뮤니티 fork다. 기반은 원본 `v0.21.2`, 커밋 [`ae7a869c989950a3a56ce5c2f7fc0df12c652933`](https://github.com/marktext/marktext/commit/ae7a869c989950a3a56ce5c2f7fc0df12c652933)다. 이번 배포에 대응하는 수정 소스는 [`v0.21.2-ai.1` 태그](https://github.com/yunju-baek/marktext-ai/tree/v0.21.2-ai.1)에서 확인할 수 있다.

## 추가한 기능

- 문서 옆의 작은 채팅창에서 요청하고 현재 Markdown 문서에 바로 적용하는 AI 편집.
- 로그인한 Codex 계정의 모델 선택, 문서별 최근 대화, 짧은 편집 결과 설명과 되돌리기.
- 드래그로 조절하는 AI 채팅창 너비와 설정 유지.
- 일반 문단의 Tab 들여쓰기와 Shift+Tab 내어쓰기. 고정 공백(NBSP, U+00A0)으로 저장해 문단 형식을 유지한다.
- 기존 목록의 Tab 하위 목록·Shift+Tab 상위 목록 동작 유지.

## 설치와 AI 연결

1. `MarkText-AI-0.21.2-ai.1-arm64.dmg`를 다운로드한다. ZIP 배포본은 `MarkText-AI-0.21.2-ai.1-arm64.zip`이다.
2. DMG를 열고 **MarkText AI.app**을 **Applications** 폴더로 드래그한다.
3. 일반 Markdown 문서는 앱에서 바로 열어 편집한다. AI 채팅은 대상 Mac에 별도로 설치한 Codex CLI와 사용자의 로그인 계정으로 연결한다.

Homebrew 사용 시 `brew install --cask codex`로 CLI를 설치하고 `codex login`으로 로그인한다. `codex login status`로 확인한 후 앱을 다시 실행한다. AI 기능에는 인터넷 연결과 Codex 이용 권한이 필요하며, 요청 시 현재 문서와 최근 대화가 선택한 모델로 전달된다. 계정의 사용 한도가 적용된다. CLI `0.159.2`에서 동작을 확인했다.

이 배포본은 로컬 ad-hoc 서명을 사용한다. Apple Developer ID 서명·공증은 미적용 상태다. 첫 실행에서 개발자 확인 안내가 나타나면 파일의 출처를 확인한 뒤 **시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기**를 선택한다. [Apple 안내](https://support.apple.com/ko-kr/102445), [설치·기본 Markdown 앱 설정 안내](https://github.com/yunju-baek/marktext-ai/blob/v0.21.2-ai.1/docs/ai-preview/INSTALL.ko.txt).

## 공개 준비 이전의 검증

로컬 개발 과정에서 AI 단위 테스트 27개와 Electron 화면 테스트 10개, TypeScript 검사를 통과했다. 문단·목록 화면 테스트 8개와 한글 입력 조합 보호 테스트 2개를 추가로 통과했다. ESLint는 오류 0개였으며 기반 프로젝트의 경고 166개가 남아 있었다. 실제 Codex 모델을 통한 후속 편집, 변경 설명, 문서 반영 및 되돌리기도 확인했다.

이번 공개판의 패키지 실행·서명·체크섬 확인 결과는 릴리스 게시 시 기록한다.

## 원본과 라이선스

원본 개발자인 Luo Ran과 MarkText Contributors에 감사드린다. 원본 저작권·허가 고지와 MIT 라이선스를 보존하며, 앱에 원본 LICENSE와 제3자 라이선스 고지를 동봉한다.

- [MIT License](https://github.com/yunju-baek/marktext-ai/blob/v0.21.2-ai.1/LICENSE)
- [이 fork의 전체 소스](https://github.com/yunju-baek/marktext-ai/tree/v0.21.2-ai.1)
- [문제 보고와 기능 요청](https://github.com/yunju-baek/marktext-ai/issues)
