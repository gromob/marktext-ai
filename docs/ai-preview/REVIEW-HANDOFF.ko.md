# MarkText Local — 독립 코드 리뷰 인계 자료

작성일: 2026-10-26 (Asia/Seoul)

이 문서의 미커밋 상태·ZIP 설명은 HEAD `90676932` 이후 **리뷰 당시 스냅샷**을 기록한 것이다. 이후 F1 HTTP 대기 수정이 적용되었으며 [후속 검증 기록](F1-HTTP-TIMEOUT-VALIDATION.ko.md)을 참고한다. 아래 스냅샷 설명을 현재 코드·Git 상태의 설명으로 간주하지 않는다.

초안은 OpenCode의 `strata-qwen38-flash-iq3/qwen3.8-flash-next-iq3_xxs`가 필요한 diff·코드 발췌·검사 근거를 바탕으로 작성했다. Codex가 실제 코드와 대조하여 함수명·설정 설명을 정정하고 근거가 부족한 결함 추정을 중립적인 검토 질문으로 정리했다. 이 문서는 독립 리뷰 결과가 아니다.

## 1. 배경 / 목표

- MarkText Local(Electron + Vue 3, pnpm monorepo)의 AI 사이드바에 **질문(ask) / 편집(edit) 모드**, **모델 문맥 메타데이터 기반 대화 자르기**, **모델별 대기 시간**, **`/new` 대화 초기화**를 추가했다.
- 목적: 이 변경을 **독립적으로 검토**할 상위 모델에게 사실/가설을 분리해 인계하는 것. 본 문서는 결론 확정이나 버그 수정이 아니다.

## 2. 기준 · 범위

- 기준: `gromob/marktext-ai`, 브랜치 `work/hanja-local`, HEAD `90676932`.
- **아직 커밋·푸시하지 않은 작업 트리 변경**이 검토 대상. 이전 한자 수정·브랜드 변경은 별도 기존 커밋이며 이번 리뷰 주 대상이 아니다.
- 상위 리뷰어 제공 자료: `changes.patch`, 관련 현재 소스·테스트 21개(`source/`), 기준 정보, 소스 SHA-256 목록, 단위/E2E 결과 발췌. 전체 대화기록·개인 설정·인증정보는 제공하지 않는다.

## 3. 구현 요약 (diff에서 확인되는 내용)

| 영역        | 변경                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 모드        | `AiMode = 'ask' \| 'edit'` 추가. ask는 백엔드(`markdown: request.markdown` 반환)와 화면(`requestMode === 'ask'`이면 `aiEditor.apply` 생략) 양쪽에서 문서 변경 차단. edit은 수정·되돌리기 유지 |
| 전환        | `AiSidebar.handleComposerKey`에서 Shift+Tab → `toggleMode()`, `event.repeat` 무시, 조합 중에도 동작. 버튼 `data-testid="ai-mode"`(`aria-pressed`)                                             |
| 문맥        | `shared/aiContext.ts`의 `contextSettings`·`fitConversation`. 접두부(system+문서) 고정, 오래된 메시지부터 버림, 선두 assistant 제거, 문서+질문 자체가 예산 초과 시 예외                        |
| 메타데이터  | `LocalRewriter.models`가 `meta.n_ctx` / `context_length` / `max_model_len`를 읽고 `contextWindow`로 저장. 저장값(설정)이 우선, 미확인 시 8192                                                 |
| 대기        | 로컬 기본 180초 → **600초**(`LocalRewriter` 기본값, `ipc/ai.ts` 생성자), 모델별 60–3600초, Codex 180초 유지                                                                                   |
| 출력        | ask에서 설정된 `max_tokens`를 전송한다. 미설정 시 `min(4096, floor(context/4))`를 사용한다. `finish_reason === 'length'` 별도 오류 문구                                                       |
| 검증        | `connection.ts`에서 `validContextWindow/validOutputTokens/validTimeoutSeconds` 및 `outputTokens + 1024 >= contextWindow` 거부                                                                 |
| /new        | `send()`에서 `/new` 전용 분기 → `newConversation()`: 현재 문서의 대화·입력만 삭제, 문서/모델/모드/서버 유지. 서버 KV 캐시 삭제 아님                                                           |
| 응답 스키마 | Codex ask는 `summary`만 허용하는 별도 output schema, 128,000자 상한                                                                                                                           |

## 4. 근거 파일 · 함수

- `packages/desktop/src/shared/aiContext.ts` — `DEFAULT_CONTEXT_WINDOW`, `contextSettings`, `fitConversation`, `validContextWindow/validOutputTokens/validTimeoutSeconds`
- `packages/desktop/src/main/ai/rewrite.ts` — `validateRequest`, `buildRewritePrompt`, `buildQuestionMessages`
- `packages/desktop/src/main/ai/local.ts` — `LocalRewriter.request`, `models`, `rewrite`(knownModels 병합, `finish_reason` 분기)
- `packages/desktop/src/main/ai/codex.ts` — `CodexRewriter.rewrite`(ask 스키마, 대화의 역할 표기 문자열 변환)
- `packages/desktop/src/main/ai/connection.ts` — `AiConnectionStore.saveServer` 모델 한도 검증
- `packages/desktop/src/main/ipc/ai.ts` — `LocalRewriter` 생성(600_000, 서버 `models` 주입)
- `packages/desktop/src/renderer/src/components/ai/AiSidebar.vue` — `mode`, `toggleMode`, `newConversation`, `requestHistory`, `selectedLimits`, `elapsedSeconds`, `handleComposerKey`, `send`
- `packages/desktop/src/renderer/src/components/ai/LocalAiManager.vue` — `setLimit`, `persist`
- `packages/desktop/src/renderer/src/util/localAiModels.ts` — `localModelOptions`(discovered/config 병합)
- `packages/desktop/src/shared/types/ai.ts` — `AiMode`, `AiModel.contextWindow/outputTokens/timeoutSeconds`, `AiRewriteResult.context`

## 5. 이미 통과한 검사 (확인된 사실)

- 관련 단위 테스트 **59개**, Electron E2E **17개**, 타입 검사, 변경 파일 ESLint 통과.
- macOS arm64 앱/ZIP/DMG 빌드 및 서명·무결성 검사 통과.
- 합성 조합 이벤트(`isComposing: true`로 Shift+Tab)에서 입력값·선택 범위(2–4)·포커스 유지 검증(`ai-modes.spec.ts`).
- 문맥 누적·설정 우선·`/new`·경과 시간·요청 중 리셋 차단 E2E 검증(`ai-context.spec.ts`): 7회 요청 후 messages 15개, 접두부 3개 동일, `max_tokens 2048`, 저장값 `{contextWindow:65536, outputTokens:2048, timeoutSeconds:1200}`.
- ask 모드에서 트랜스포트가 `markdown`을 바꿔 보내도 편집·undo 버튼이 생성되지 않음 검증.

## 6. 미검증 항목 · 제약 (확인된 사실)

- 이전의 전체 관련 **206개 검사를 이번 변경에 대해 전부 재실행하지 않았다**.
- 앱의 새 질문·문맥 구조에 대해서는 실제 서버의 `/models` 정보를 조회했으며 **추론 속도·캐시 재사용은 측정하지 않았다**. 리뷰 자료 초안 작성은 별도의 OpenCode 추론 호출이다.
- Strata 131072 / Splash 262144는 **그 시점 서버가 보고한 값**이며 하드코딩이 아니다.
- 실제 macOS IME 조합 중 Shift+Tab은 **사용자 검증 필요**(합성 이벤트만 통과).
- Computer Use는 사용자가 금지했다. 정확한 토크나이저 없음(UTF-8 바이트 보수 추정 + 1024 예약), 스트리밍 구현 아님.
- 질문 모드는 앱 전송 상한(본문 2,000,000자·대화 총 8,000,000자·10,000개 메시지) 안에서 모델 문맥 예산을 적용한다. 편집 모드는 기존 300,000자 본문·최근 10개 메시지·24,000자 이력 제한을 유지한다.
- Codex 질문 모드에는 현재 기본 8192 문맥 예산이 적용되며 로컬 모델 관리 설정이 적용되지 않는다.
- 테스트 결과는 관련 범위의 결과이며 모든 모델·입력기·서버 조합에 대한 보장이 아니다.

## 7. 우선 검토할 질문 — 결함 확정 아님

1. **문맥 예산·검증:** 문자 수 상한, UTF-8 바이트 기반 추정, 출력 예약, 채팅 템플릿 여유가 일관적인가? 정확한 토크나이저 없이 적용한 정책의 한계와 경계값을 구분해 검토한다.
2. **메타데이터·설정:** 서버 보고값·사용자 설정·미확인 기본값의 우선순위가 코드와 UI에서 일치하는가? 발견된 순간값의 저장, 모델/주소 변경 후 메타데이터 갱신을 확인한다. 학습 최대값을 런타임 한도로 오인하지 않는가?
3. **대화 구성·캐시:** 메시지 순서·역할·완전한 메시지 단위 제외·선두 assistant 정리·답변 JSON 재인코딩이 적절한가? 접두부가 유지되는 범위와 실제 캐시 재사용 가능성을 구분한다.
4. **문서 보호·비동기 처리:** 질문 모드의 이중 보호, 수정 중 응답·탭 전환·취소·창 종료·늦은 응답, AI 편집·undo/redo가 안전한가? 연결 오류 시 다른 모델로 전환하지 않는가?
5. **스키마·한도:** 질문 답변 전용 스키마, 편집 본문·요약, 출력 잘림·잘못된 JSON·큰 응답·시간 초과를 안전하고 정확하게 처리하는가?
6. **이력·`/new`:** 성공 요청만 다음 문맥에 포함되는가? 현재 문서 대화·입력만 초기화하고 다른 문서·본문·모델·모드·서버는 보존하는가? 서버 캐시를 지운다고 오해시키지 않는가?
7. **UI·입력·수명주기:** IME 조합 중 Shift+Tab, 기본 포커스 이동과의 절충, 입력 요소·선택 영역 유지, 모델 설정 저장, 경과 시간 타이머 정리가 적절한가?
8. **검증 공백:** 기존 검사로 충분히 뒷받침되지 않는 위험이 있는가? 재현 가능한 작은 추가 검사만 제안하고 관련 없는 기능·리팩터링은 제외한다.

## 8. 상위 모델에 붙여 넣을 요청문

```text
첨부한 MarkText Local 리뷰 패키지의 미커밋 변경을 독립적으로 리뷰해 주세요.
기준은 gromob/marktext-ai, work/hanja-local, HEAD 90676932입니다.
검토 대상은 질문/편집 모드, 문맥 예산·대화 누적, 로컬 대기 시간, /new입니다.

자료
- REVIEW-HANDOFF.ko.md: 목표·검증 범위·미검증 사항
- changes.patch: 기준 커밋 대비 코드·테스트 변경
- source/: 관련 현재 소스와 테스트 21개(전체 저장소가 아님)
- BASE.txt, source-manifest.json, unit-results.txt, e2e-results.txt

규칙
- 읽기 전용으로 리뷰하고 소스·설정·Git 상태를 변경하지 마세요.
- Computer Use를 사용하지 마세요. 실제 LLM 서버의 시작·중지·모델 교체도 금지합니다.
- 문서에 적힌 구현 의도를 정답으로 가정하지 말고 코드와 반례로 검증하세요.
- 실제 결함과 설계 선택·추정·검증 부족을 명확히 구분하세요.
- 테스트 통과를 모든 상황의 정상 동작이나 실제 캐시 성능의 증거로 확대하지 마세요.
- 자료가 부족하면 필요한 최소 파일·로그·수동 확인 절차를 구체적으로 요청하세요.
- 기능 추가와 무관한 리팩터링은 제안하지 마세요.

출력
A. 확인된 결함: 심각도(P0~P3), 파일·함수·코드 위치, 재현 조건/반례,
   사용자 영향, 최소 수정 방향. 근거가 없으면 확정 결함으로 보고하지 마세요.
   확인된 결함이 없으면 그렇게 명시하세요.
B. 설계 선택·불확실성: 실제 결함과 구분하고 근거·추가 확인 방법을 적으세요.
C. 검증 공백: 자동 검사로 확인할 항목과 사용자 macOS IME/실제 서버 검사 항목을 구분하세요.

단위 59개·Electron E2E 17개 통과는 관련 검사 결과입니다.
예전의 관련 검사 206개 전체는 이번 변경에 대해 다시 실행하지 않았습니다.
서버의 문맥 정보 조회는 성공했지만 앱의 새 구조에 대한 실제 추론·캐시 속도는 미측정입니다.
```

## 9. 자료 사용과 상태

- GitHub의 작업 브랜치만 열면 이 미커밋 변경이 보이지 않는다. ZIP의 현재 소스와 패치를 함께 검토해야 한다.
- 패치의 `git apply --reverse --check`를 현재 작업 트리에서 통과시켜 스냅샷 일치를 확인했다. 소스는 변경하지 않았다.
- 이 패키지는 설치판이나 완전한 빌드용 체크아웃이 아니다. 원본 전체가 필요하면 BASE.txt의 커밋을 기준으로 필요한 파일만 추가 확보한다.
- 이 자료 작성으로 새 커밋·푸시·상위 모델 호출을 수행하지 않았다. 로컬 LLM 초안 작성 중 도구 호출·파일 수정도 없었다.
