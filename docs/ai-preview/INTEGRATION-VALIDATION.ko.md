# 공개 준비 최종 통합 검사

검사일: 2026-10-24 (Asia/Seoul)

검사 대상은 `work/hanja-local`의 한자 수정 커밋 `561d02b5`와 미커밋 로컬 AI·서버 관리·글꼴 설정 변경을 합친 작업 트리다. Node 22.23.3, pnpm 10.33.4, macOS arm64에서 실행했다. 검사 과정에서 앱·테스트 소스는 변경하지 않았다.

## 결과

| 검사                | 범위                                                                        | 결과                      |
| ------------------- | --------------------------------------------------------------------------- | ------------------------- |
| Muya 단위           | 입력 조합, 키 처리, history, 선택 복원 및 문서 교체 · 13개 파일             | 95개 통과                 |
| Desktop 단위        | Codex, 로컬 통신·키 저장, 모델 선택, AI 편집 및 편집 명령 리스너 · 7개 파일 | 64개 통과                 |
| Chromium E2E        | 한자 대체 입력, 일반 조합, 줄바꿈, undo/redo 및 커서 복원 · 6개 파일        | 32개 통과                 |
| Electron E2E        | AI 편집, 서버·모델 관리, 키·주소 저장, 글꼴 및 Preferences · 5개 파일       | 15개 통과                 |
| Desktop 타입 검사   | Muya 선언 빌드 및 vue-tsc                                                   | 통과                      |
| Muya 타입 검사      | tsc --noEmit                                                                | 통과                      |
| 루트 린트           | Desktop 등 루트 설정 적용 범위                                              | 오류 0개, 기존 경고 166개 |
| 변경 Muya 파일 린트 | 런타임·단위 검사·E2E 파일                                                   | 통과                      |
| 앱 빌드             | build:unpack                                                                | 통과                      |
| 문서 형식·diff      | Prettier 및 git diff --check                                                | 통과                      |

관련 자동 검사는 총 **206개**(단위 159개, E2E 47개) 통과했다. 저장소 전체 테스트를 모두 실행했다는 의미는 아니며 아래 명령에 명시한 관련 회귀 범위의 결과다. 빌드에는 기존 CodeMirror 정적·동적 import 관련 경고가 남아 있지만 종료 코드는 0이다.

## 확인 내용

- 일반 문단·목록·표에서 선택 전후의 대체 입력, 음절 확정 직후 재변환, undo/redo 및 선택·커서 복원을 검사했다.
- AI 응답의 단일 편집 적용과 실행 취소, 일반 질문의 문서 보존, 요청 중 문서·탭 변경 시 오래된 결과 차단을 검사했다.
- 로컬 토큰의 일반 설정 파일 저장, 설정 조회 응답의 키 비노출, 이전 암호화 키 재입력 경로, 실제 시험용 인증 헤더와 오류 응답을 검사했다.
- 서버·모델 등록·수정·삭제, 삭제한 선택의 전송 차단, 실패한 주소를 수정한 뒤 저장과 조회가 이어지는 경로를 검사했다.
- Preferences와 AI 창 글꼴 조절의 양방향 반영, 메뉴·입력·서버 관리의 비례 확대, 범위 제한 및 앱 재시작 후 보존을 검사했다.
- 기존 본문 최대 너비 설정의 입력 검증·저장·반영도 검사했다.

## 재실행 명령

저장소 루트에서 실행한다.

```sh
pnpm -C packages/desktop exec vitest run test/unit/specs/ai-codex.spec.ts test/unit/specs/ai-codex-models.spec.ts test/unit/specs/ai-editor.spec.ts test/unit/specs/ai-local.spec.ts test/unit/specs/ai-connection.spec.ts test/unit/specs/ai-local-model-options.spec.ts test/unit/specs/listen-for-main.spec.ts

pnpm -C packages/muya exec vitest run src/history/__tests__ src/__tests__/historySerialization.spec.ts src/__tests__/replaceContent.spec.ts src/block/base/__tests__/imeKeydown.spec.ts src/block/base/__tests__/imeTabComposition.spec.ts src/block/base/__tests__/imeBackspaceComposition.spec.ts src/block/base/__tests__/imeSoftLineBreak.spec.ts src/block/base/__tests__/autoPair.spec.ts src/block/content/tableCell/__tests__/composeHandler.spec.ts src/ui/__tests__/uiHandleContentKeydown.spec.ts

pnpm run typecheck
pnpm -C packages/muya lint:types
pnpm run lint
pnpm -C packages/muya exec eslint src/block/base/content.ts src/muya.ts src/block/base/__tests__/imeKeydown.spec.ts
pnpm -C packages/muya exec eslint --no-ignore e2e/tests/typing/ime-reconversion.spec.ts e2e/tests/typing/ime.spec.ts

pnpm run build:unpack
pnpm -C packages/desktop exec playwright test test/e2e/ai-editing.spec.ts test/e2e/ai-wysiwyg-selection.spec.ts test/e2e/ai-local-editing.spec.ts test/e2e/ai-font-size.spec.ts test/e2e/issue-5331-pref-max-width.spec.ts
pnpm -C packages/muya/e2e exec playwright test tests/typing/ime-reconversion.spec.ts tests/typing/ime.spec.ts tests/typing/ime-soft-line-break.spec.ts tests/typing/codeblock-node-identity.spec.ts tests/editing/undo-redo.spec.ts tests/editing/undo-redo-wedge-4685.spec.ts --project chromium --workers 1

git diff --check
```

## 자동 검사와 실제 사용 확인의 구분

Chromium 검사는 합성 이벤트와 CDP를 사용하며 실제 macOS 입력기의 후보창·변환 취소를 직접 조작한 검사가 아니다. 실제 IME의 이전 사용자 확인은 [한자 검증 기록](HANJA-IME-VALIDATION.ko.md)에 별도로 남아 있다. 이번 단계에서 새 수동 IME 검사를 수행하지 않았다.

로컬 AI 검사는 격리된 임시 프로필과 시험용 HTTP 서버를 사용했다. 실제 사용자 서버의 추론, 새 서버 추가의 전체 수동 절차, 설치판의 키체인 창 미발생 여부를 이번 단계에서 재검증한 것은 아니다. 원본 MarkText 최신 `develop`의 동일 증상 재현도 미확인이다.

이번 단계에서는 새 DMG 생성·코드 서명 검사·공개 릴리스 작업을 수행하지 않았다. 공개용 버전·태그 결정과 해당 소스의 설치판 빌드는 후속 단계다. 커밋·푸시·외부 Issue나 PR 작성도 수행하지 않았다.
