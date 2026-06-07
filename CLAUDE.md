# CLAUDE.md — 에이전트 강제 규칙 (Landing Page from Reference)

> 이 파일은 하네스의 **에이전트-강제 규칙**이다. Claude Code 가 매 세션 자동 로드한다.
> Ralph 루프의 매 반복은 이 규칙 안에서만 일한다.

## 0. 가장 먼저 (Iron Law)

**작업 전 반드시 `GOAL.md` 를 읽는다.** 거기에 절대 규칙·완료 조건·정식 해석이 있다.
GOAL.md 와 충돌하는 행동은 하지 않는다.

## 1. Context Loading Protocol — 작업 트리거별 필수 읽기

| 작업 트리거 | 작업 전 반드시 읽을 파일 |
|---|---|
| 무엇이든 시작 | `GOAL.md`, `PROGRESS.md` (현재 상태) |
| 데이터/타입 변경 | `schemas/analysis.schema.json`, `schemas/patch.schema.json`, `lib/schema.ts` |
| LLM 호출 코드 | `lib/openai.ts`, `lib/mock.ts`, 해당 스키마 |
| UI/렌더 변경 | `lib/schema.ts` (SectionSpec), `components/sections/*` |
| API 변경 | `lib/db.ts`, `lib/validate.ts`, 관련 `lib/agents/*` |
| 검증/완료 판단 | `harness/verify.sh`, `GOAL.md`(완료 조건) |

## 2. 단일 진실원천 (SSOT)

- 데이터 계약 = `schemas/*.schema.json`. **여기가 진실.**
- `lib/schema.ts` TS 타입은 스키마의 거울이다. 둘은 항상 일치.
- 새 필드가 필요하면 **스키마 먼저 고치고**, 타입·검증·렌더 순서로 전파.
- 타입을 컴포넌트/라우트에 인라인 재정의하지 않는다. 항상 `lib/schema.ts` 에서 import.

## 3. 검증 사다리 (싼 것 먼저 — 예산 소진 방지)

작업 단위를 끝내면 **반드시** 아래 순서로 검증한다. 앞 단계 실패 시 뒤로 가지 않는다.

```
1) node harness/check-schemas.mjs   # JSON Schema + fixture 검증 (가장 쌈)
2) npx tsc --noEmit                  # 타입 체크
3) npm run build                     # Next.js 빌드
4) (선택) preview 스모크 + screenshot # 가장 비쌈, 최후에만
```

또는 한 번에: `bash harness/verify.sh`

## 4. 완료 주장 전 자가검증 (write→read 의무)

- 파일을 만들었다고 주장하기 전에 **실제로 생성/빌드됐는지 관찰**한다 (win-hooks 교훈 ④).
- "verify 가 healthy 라고 했으니 됐다" 금지 — 실행 결과·exit code·부정 신호 부재까지 확인.
- 실패하면 실패라고 말한다. 성공을 가장하지 않는다.

## 5. 데이터 파괴 금지

- 사용자 JSON 은 **patch + version 증가**로만 변경. 덮어쓰기 금지.
- `runs/`·`schemas/`·`GOAL.md`·`.bak` 류를 파괴적으로 다루지 않는다.
- `rm -rf`, `git reset --hard`, `git clean -f` 는 PreToolUse 훅이 차단한다.

## 6. 조기 정지 금지 (fallback)

- 외부 의존(LLM/네트워크/브라우저) 실패 시 **`lib/mock.ts` 결정적 폴백**으로 진행.
- `OPENAI_API_KEY` 없으면 자동 mock 모드. 앱은 키 없이도 동작해야 한다.
- "정보 부족"으로 멈추지 말 것. 부분 결과라도 스키마를 채워 다음 단계로.

## 7. 커밋 규율

- 의미 있는 단위마다 커밋. 메시지: `<scope>: <what>` (예: `feat(api): analyze route`).
- 커밋 푸시/PR 은 사용자가 요청할 때만. 로컬 커밋은 자유.
- 커밋 trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

## 8. 스크린샷

- UI/렌더가 바뀌면 `screenshots/` 에 저장 (`<step>-<desc>.png`).

## 9. 완료 신호 (Ralph 루프 종료 조건)

GOAL.md 의 완료 조건 7개가 **모두** 참이고 `harness/verify.sh` 가 exit 0 일 때만:

1. `.harness/state/ONESHOT_COMPLETE` 센티넬 생성
2. 마지막 줄에 정확히 `<promise>ONESHOT COMPLETE</promise>` 출력

그 전에는 절대 완료를 선언하지 않는다.
