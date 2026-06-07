# AGENTS.md

이 저장소의 에이전트 규칙은 **`CLAUDE.md` 와 동일**하다 (Codex/기타 런타임용 미러).

핵심만 재요약 — 자세한 건 `CLAUDE.md`, `GOAL.md` 참조:

1. 작업 전 `GOAL.md` + `PROGRESS.md` 를 읽는다.
2. 데이터 계약 SSOT = `schemas/*.schema.json`. 타입은 `lib/schema.ts` 에서만 import.
3. 단일 Node 프로세스. `node:sqlite` + `playwright`(Node) + Next.js Route Handler.
4. 검증 사다리: `bash harness/verify.sh` (schema → typecheck → build).
5. 외부 의존 실패 시 `lib/mock.ts` 폴백 (조기 정지 금지).
6. 사용자 JSON 은 patch+version 으로만 변경 (데이터 파괴 금지).
7. 기능마다 커밋, UI 변경마다 `screenshots/` 저장.
8. 완료 조건(GOAL.md) 전부 충족 + verify exit 0 일 때만 `<promise>ONESHOT COMPLETE</promise>`.
