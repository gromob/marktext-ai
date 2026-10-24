[English](README.md) · **한국어**

<p align="center"><img src="docs/assets/marktext-local-icon.png" alt="MarkText Local 앱 아이콘" width="128" height="128"></p>

# MarkText Local

Markdown editor with local AI and Codex support. 프로젝트 별칭은 **AJ**다.

[MarkText AI](https://github.com/yunju-baek/marktext-ai)의 `v0.21.2-ai.2` (`7cd32b04`)를 기반으로 한 독립적인 비공식 fork다. 원본 [MarkText](https://github.com/marktext/marktext)와 MarkText AI의 공식 배포판이 아니다.

## 주요 기능

- 기존 Markdown 편집과 Codex 연결을 유지한다.
- OpenAI 호환 로컬 AI 서버와 모델을 추가·수정·삭제하고 모델 목록을 조회한다.
- macOS 한자 변환 및 실행 취소·커서 복원 처리를 개선했다.
- AI 창의 대화·입력·메뉴 글꼴 크기를 조절하고 저장한다.
- M의 오른쪽 발을 칩으로 표현한 새 앱 아이콘을 사용한다.

로컬 AI 서버 실행과 모델 로딩은 사용자가 담당한다. 요청에는 현재 문서와 최근 대화가 선택한 서버로 전달된다. 로컬 서버용 API 키는 사용자 프로필에 **평문으로 저장**하며 Keychain을 사용하지 않는다.

## 개발과 빌드

Node.js 20.19 이상, pnpm 10 및 Xcode Command Line Tools가 필요하다. 검증 환경은 Apple Silicon, Node 22.23.3, pnpm 10.33.4다.

```sh
git clone https://github.com/gromob/marktext-ai.git
cd marktext-ai
git checkout work/hanja-local
pnpm install --frozen-lockfile
pnpm run dev
```

Apple Silicon용 설치판은 다음 명령으로 빌드한다.

```sh
./scripts/build-ai-mac.sh
```

출력은 `dist/mac-arm64/MarkText Local.app`, `dist/MarkText-Local-<version>-arm64.dmg` 및 ZIP이다. 현재 패키지 번호 `0.21.2-ai.2`는 기준 버전을 유지한 로컬 검증용이다. **MarkText Local의 공개 릴리스는 아직 발행하지 않았다.** 로컬 빌드는 ad-hoc 서명이며 Apple Developer ID 서명·공증은 적용하지 않았다.

기존 설정과 복구 데이터를 보존하기 위해 앱 ID `local.marktext.ai`와 프로필 경로 `~/Library/Application Support/MarkText AI`는 유지한다. 이전 설치 앱은 자동으로 제거하지 않는다.

## 안내와 검증

- [사용법과 개발 안내](docs/ai-preview/README.ko.md)
- [로컬 AI 연결](docs/ai-preview/LOCAL-AI.ko.md)
- [설치 안내](docs/ai-preview/INSTALL.ko.txt)
- [관련 자동 검사 206개 검증 기록](docs/ai-preview/INTEGRATION-VALIDATION.ko.md)
- [한자 입력 검증 기록](docs/ai-preview/HANJA-IME-VALIDATION.ko.md)
- [문제 보고](https://github.com/gromob/marktext-ai/issues)

AJ는 기존 AI를 수열의 항 $A_i$로 보고 그 변형을 $A_j$로 표현한 별칭이다.

## 기반과 라이선스

기반 프로젝트는 [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai)이며, 그 원본은 MarkText v0.21.2다. 원저작자 Luo Ran, MarkText Contributors 및 AI fork 개발자 Yunju Baek의 기여를 보존한다.

[MIT License](LICENSE), [NOTICE](NOTICE), [제3자 라이선스](packages/desktop/build/THIRD-PARTY-LICENSES.txt)를 함께 제공한다.
