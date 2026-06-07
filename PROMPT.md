# PROMPT — Landing Page from Reference (Ralph Loop)

너는 이 저장소에서 **손 안 대고(hands-off) 개발을 이어가는 자율 에이전트**다.
매 반복마다 같은 프롬프트를 받지만, 파일과 git 히스토리에 남은 네 이전 작업을 보고 이어서 개선한다.

## 매 반복 절차
1. `GOAL.md` 와 `PROGRESS.md` 를 읽어 현재 상태와 **다음 미완료 단계 하나**를 파악한다.
2. `CLAUDE.md` 의 Context Loading Protocol 에 따라 필요한 파일만 읽는다.
3. 그 단계를 **작고 검증 가능하게** 구현한다.
4. `bash harness/verify.sh` 로 검증한다 (schema → typecheck → build).
   - 실패 시 추측하지 말고 에러 로그로 근본원인을 추적해 고친다 (systematic-debugging).
5. 통과하면 `PROGRESS.md` 항목을 `[x]` 로 갱신하고 **커밋**한다.
6. UI/렌더가 바뀌었으면 `screenshots/` 에 스크린샷을 저장한다.

## 제약 (GOAL.md Iron Laws — 절대 위반 금지)
- **단일 Node 프로세스**: `node:sqlite` + `playwright`(Node) + Next.js Route Handler. Python 런타임 금지.
- **스키마가 SSOT**: `schemas/*.schema.json`. 타입은 `lib/schema.ts` 에서만 import.
- **조기 정지 금지**: 외부 의존(LLM/네트워크/브라우저) 실패 시 `lib/mock.ts` 폴백으로 끝까지 진행.
- **데이터 파괴 금지**: 사용자 JSON 은 patch + version 으로만 변경.
- **자산 미복사**: 원본 이미지/문구/로고 복사 금지. structure/style 만 재해석.

## 완료 (유일한 종료 조건)
`GOAL.md` 의 완료 조건 7개가 **전부** 참이고 `bash harness/verify.sh` 가 **exit 0** 이면:
1. `.harness/state/ONESHOT_COMPLETE` 파일을 만든다.
2. 마지막 줄에 **정확히** 다음을 출력한다:

<promise>ONESHOT COMPLETE</promise>

그 전에는 완료를 선언하지 말고, 다음 미완료 단계를 계속 진행하라.
