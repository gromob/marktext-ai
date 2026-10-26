[English](README.md) · **한국어**

<p align="center"><img src="docs/assets/marktext-local-icon.png" alt="MarkText Local 앱 아이콘" width="128" height="128"></p>

# MarkText Local

Markdown editor with local AI and Codex support. 프로젝트 별칭은 **AJ**다.

[MarkText AI](https://github.com/yunju-baek/marktext-ai)의 `v0.21.2-ai.2` (`7cd32b04`)를 기반으로 한 독립적인 비공식 fork다. 원본 [MarkText](https://github.com/marktext/marktext)와 MarkText AI의 공식 배포판이 아니다.

## 주요 기능

- 기존 Markdown 편집과 Codex 연결을 유지한다.
- AI 입력창의 **Shift+Tab** 또는 모드 버튼으로 질문·분석 / 문서 편집을 전환한다. 질문 모드에서는 본문을 변경하지 않는다.
- 모델별 문맥 예산 안에서 질문 대화를 누적하고 **/new** 초기화와 로컬 응답 대기 시간 설정을 지원한다.
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

## 공개 릴리스 전 남은 사항

- 연결 설정 저장 시 자동으로 조회한 문맥 한도가 저장 오버라이드가 될 수 있다. 서버 실행 문맥을 바꾼 경우 등록 모델의 문맥 필드를 비우거나 올바른 값으로 수정해야 한다. 조회값과 명시적 사용자 설정을 분리하는 수정은 후속 작업이다.
- Codex 질문 모드는 모델별 조정 수단 없이 보수적 8192토큰 문맥 예산을 사용한다. 일부 문서는 CLI 실행 전에 거부되며 로컬 모델 설정으로 이 한도를 바꿀 수 없다.
- 로컬 HTTP의 숨은 5분 대기 제한은 수정했고, 310초 지연 응답 수신을 검증했다. [HTTP 대기 수정 검증 기록](docs/ai-preview/F1-HTTP-TIMEOUT-VALIDATION.ko.md)을 참고한다.

이번 변경은 개발 브랜치의 작업 결과이며 공개 릴리스가 아니다. 실제 macOS 입력기 동작과 로컬 서버 추론·캐시 성능은 사용자 확인과 구분한다.

## 기반과 라이선스

기반 프로젝트는 [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai)이며, 그 원본은 MarkText v0.21.2다. 원저작자 Luo Ran, MarkText Contributors 및 AI fork 개발자 Yunju Baek의 기여를 보존한다.

[MIT License](LICENSE), [NOTICE](NOTICE), [제3자 라이선스](packages/desktop/build/THIRD-PARTY-LICENSES.txt)를 함께 제공한다.
